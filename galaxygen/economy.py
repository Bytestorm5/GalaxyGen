"""
Economic simulation primitives based on the galactic economy design doc.

This module favors explicit, readable formulas over exhaustive fidelity. It
implements the core loops (economic tick, yearly demographic tick), data
containers, and chain definitions so the game layer can iterate quickly.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
from pydantic import BaseModel, Field

# --- Enumerations ------------------------------------------------------------------


class Good(str, Enum):
    RAW_FOOD = "raw_food"
    PROCESSED_FOOD = "processed_food"
    RAW_ORE = "raw_ore"
    REFINED_METALS = "refined_metals"
    ALLOYS = "alloys_composites"
    SUBSTRATES = "substrates"
    MICROCHIPS = "microchips"
    ELECTRONICS = "electronics_control"
    SHIP_COMPONENTS = "ship_components"
    ENERGY = "energy"
    CONSUMER_GOODS = "consumer_goods"
    SERVICES = "services"
    FINISHED_SHIPS = "finished_ships"
    RESEARCH_POINTS = "research_points"
    HOUSING = "housing_unit"


class Sector(str, Enum):
    AGRICULTURE = "agriculture"
    EXTRACTION = "extraction"
    ENERGY = "energy"
    LIGHT_INDUSTRY = "light_industry"
    HEAVY_INDUSTRY = "heavy_industry"
    ELECTRONICS = "electronics"
    SHIPBUILDING = "shipbuilding"
    SERVICES = "services"
    RESEARCH = "research"
    CONSTRUCTION = "construction"
    MILITARY = "military"


class TechField(str, Enum):
    ENERGY_SYSTEMS = "energy_systems"
    MATERIALS = "materials_manufacturing"
    ELECTRONICS = "electronics_computing"
    LIFE_SCIENCES = "life_sciences_bio"
    NAVIGATION = "ftl_navigation"
    SOCIAL = "social_governance"


class SkillBucket(str, Enum):
    AGRO_BIO = "agro_bio"
    EXTRACTION = "extraction_materials"
    ENGINEERING = "engineering_manufacturing"
    LOGISTICS = "logistics_trade"
    SERVICES = "services_governance"
    SCIENCE = "science_computing"
    MILITARY = "military_security"
    UNSKILLED = "unskilled"


# --- Population & Demography -------------------------------------------------------

COHORT_LABELS = [
    "0-4",
    "5-9",
    "10-14",
    "15-19",
    "20-24",
    "25-29",
    "30-34",
    "35-39",
    "40-44",
    "45-49",
    "50-54",
    "55-59",
    "60-64",
    "65-69",
    "70-74",
    "75-79",
    "80-84",
    "85+",
]

REPRODUCTIVE_COHORTS = [3, 4, 5, 6, 7]  # 15-39
WORKING_AGE_COHORTS = list(range(4, 13))  # 20-64


class PopulationPyramid(BaseModel):
    cohorts: List[float] = Field(default_factory=lambda: [0.0 for _ in COHORT_LABELS])

    def total(self) -> float:
        return float(sum(self.cohorts))

    def working_age(self) -> float:
        return float(sum(self.cohorts[i] for i in WORKING_AGE_COHORTS))

    def new_adults(self) -> float:
        # Those entering working age: cohort 3 (15-19) aging into 20-24 bin
        return float(self.cohorts[3])

    def births(self, qos: float, culture_mod: float = 1.0, policy_mod: float = 1.0) -> float:
        # Inverse-normal fertility
        sigma = 0.24
        tfr_min = 1.4
        tfr_max = 3.6
        bump = math.exp(-((qos - 0.5) ** 2) / (2 * sigma**2))
        inv = 1 - bump
        tfr_raw = tfr_min + (tfr_max - tfr_min) * inv
        tfr = tfr_raw * culture_mod * policy_mod
        reproductive_span_years = 22
        avg_annual_fertility = tfr / reproductive_span_years
        # Age-specific weights (peaks in 20s)
        weights = {3: 0.15, 4: 0.28, 5: 0.27, 6: 0.2, 7: 0.1}
        births = 0.0
        for idx in REPRODUCTIVE_COHORTS:
            cohort_pop = self.cohorts[idx]
            cohort_females = 0.5 * cohort_pop
            rate = avg_annual_fertility * weights.get(idx, 0)
            births += cohort_females * rate
        return births

    def mortality(self, qos: float, density: float, conflict: float = 0.0) -> List[float]:
        # Baseline yearly mortality by cohort (rough stylized numbers)
        base = [
            0.012,
            0.002,
            0.0015,
            0.001,
            0.001,
            0.0012,
            0.0015,
            0.002,
            0.003,
            0.004,
            0.006,
            0.009,
            0.014,
            0.022,
            0.035,
            0.055,
            0.08,
            0.12,
        ]
        # QoL scaling
        m_q_min, m_q_max = 3.0, 0.4
        m_q = m_q_min + (m_q_max - m_q_min) * max(0.0, min(1.0, qos))
        overcrowd = max(0.0, density - 1.0)
        m_density = 1 + 0.6 * (overcrowd**2)
        m_conflict = 1 + 1.2 * conflict
        deaths = []
        for i, p_base in enumerate(base):
            rate = p_base * m_q * m_density * m_conflict
            rate = max(0.0, min(0.5, rate))
            deaths.append(self.cohorts[i] * rate)
        return deaths

    def yearly_advance(self, qos: float, density: float, conflict: float = 0.0) -> "PopulationPyramid":
        deaths = self.mortality(qos, density, conflict)
        survivors = [max(0.0, pop - d) for pop, d in zip(self.cohorts, deaths)]
        next_cohorts = [0.0 for _ in COHORT_LABELS]
        for i in range(len(COHORT_LABELS) - 1):
            next_cohorts[i + 1] += survivors[i]
        next_cohorts[-1] += survivors[-1]
        return PopulationPyramid(cohorts=next_cohorts)


# --- Education & Labor -------------------------------------------------------------


class EducationState(BaseModel):
    students: Dict[SkillBucket, float] = Field(default_factory=lambda: {b: 0.0 for b in SkillBucket})
    skilled: Dict[SkillBucket, float] = Field(default_factory=lambda: {b: 0.0 for b in SkillBucket})
    unskilled: float = 0.0

    def assign_new_adults(
        self,
        new_adults: float,
        weights: Dict[SkillBucket, float],
    ) -> None:
        total_w = sum(max(0.0, w) for w in weights.values()) or 1.0
        for bucket, w in weights.items():
            share = max(0.0, w) / total_w
            self.students[bucket] += new_adults * share

    def graduate(self, grad_rate: float = 0.2) -> None:
        for bucket in SkillBucket:
            grads = self.students[bucket] * grad_rate
            self.students[bucket] -= grads
            self.skilled[bucket] += grads


class LaborMarketState(BaseModel):
    wages: Dict[SkillBucket, float] = Field(
        default_factory=lambda: {b: 1.0 for b in SkillBucket}
    )  # nominal annual units
    unemployment: Dict[SkillBucket, float] = Field(
        default_factory=lambda: {b: 0.0 for b in SkillBucket}
    )
    vacancies: Dict[SkillBucket, float] = Field(default_factory=lambda: {b: 0.0 for b in SkillBucket})

    def update_wages(self, excess: Dict[SkillBucket, float], productivity: float = 0.0) -> None:
        lam = 0.2
        zeta = 0.05
        for bucket in SkillBucket:
            w = self.wages[bucket]
            growth = lam * excess.get(bucket, 0.0) + zeta * productivity
            w_next = w * (1 + growth)
            # Clamp jumps
            max_jump = 0.2
            w_next = max(0.1, min(w * (1 + max_jump), w_next))
            self.wages[bucket] = w_next


# --- Buildings & Industry ----------------------------------------------------------


class BuildingArchetype(BaseModel):
    code: str
    name: str
    sector: Sector
    tech_field: TechField
    inputs: Dict[Good, float]  # per output unit
    output: Good
    labor_mix: Dict[SkillBucket, float]  # shares sum to 1
    energy_per_unit: float = 0.0
    base_capacity: float = 10.0


class BuildingInstance(BaseModel):
    archetype: BuildingArchetype
    level: int = 1
    utilization: float = 1.0

    def capacity(self, tech_multiplier: float = 1.0, planet_mod: float = 1.0) -> float:
        return self.archetype.base_capacity * self.level * tech_multiplier * planet_mod


def default_building_catalog() -> Dict[str, BuildingArchetype]:
    cat = {}
    cat["F1"] = BuildingArchetype(
        code="F1",
        name="Farming & Hydroponics",
        sector=Sector.AGRICULTURE,
        tech_field=TechField.LIFE_SCIENCES,
        inputs={Good.ENERGY: 0.5},
        output=Good.RAW_FOOD,
        labor_mix={SkillBucket.AGRO_BIO: 0.6, SkillBucket.UNSKILLED: 0.4},
        base_capacity=20,
    )
    cat["F2"] = BuildingArchetype(
        code="F2",
        name="Food Processing",
        sector=Sector.AGRICULTURE,
        tech_field=TechField.LIFE_SCIENCES,
        inputs={Good.RAW_FOOD: 1.2, Good.ENERGY: 0.3},
        output=Good.PROCESSED_FOOD,
        labor_mix={SkillBucket.AGRO_BIO: 0.3, SkillBucket.ENGINEERING: 0.3, SkillBucket.UNSKILLED: 0.4},
        base_capacity=18,
    )
    cat["M1"] = BuildingArchetype(
        code="M1",
        name="Mining & Extraction",
        sector=Sector.EXTRACTION,
        tech_field=TechField.MATERIALS,
        inputs={Good.ENERGY: 0.6},
        output=Good.RAW_ORE,
        labor_mix={SkillBucket.EXTRACTION: 0.6, SkillBucket.UNSKILLED: 0.4},
        base_capacity=16,
    )
    cat["M2"] = BuildingArchetype(
        code="M2",
        name="Refining & Smelting",
        sector=Sector.HEAVY_INDUSTRY,
        tech_field=TechField.MATERIALS,
        inputs={Good.RAW_ORE: 1.5, Good.ENERGY: 0.8},
        output=Good.REFINED_METALS,
        labor_mix={SkillBucket.EXTRACTION: 0.3, SkillBucket.ENGINEERING: 0.4, SkillBucket.UNSKILLED: 0.3},
        base_capacity=14,
    )
    cat["M3"] = BuildingArchetype(
        code="M3",
        name="Advanced Materials",
        sector=Sector.HEAVY_INDUSTRY,
        tech_field=TechField.MATERIALS,
        inputs={Good.REFINED_METALS: 1.1, Good.ENERGY: 0.9},
        output=Good.ALLOYS,
        labor_mix={SkillBucket.ENGINEERING: 0.6, SkillBucket.UNSKILLED: 0.4},
        base_capacity=12,
    )
    cat["E1"] = BuildingArchetype(
        code="E1",
        name="Substrate Production",
        sector=Sector.ELECTRONICS,
        tech_field=TechField.ELECTRONICS,
        inputs={Good.ALLOYS: 0.6, Good.ENERGY: 0.7},
        output=Good.SUBSTRATES,
        labor_mix={SkillBucket.ENGINEERING: 0.4, SkillBucket.SCIENCE: 0.4, SkillBucket.UNSKILLED: 0.2},
        base_capacity=8,
    )
    cat["E2"] = BuildingArchetype(
        code="E2",
        name="Microfabrication",
        sector=Sector.ELECTRONICS,
        tech_field=TechField.ELECTRONICS,
        inputs={Good.SUBSTRATES: 1.2, Good.ENERGY: 0.8},
        output=Good.MICROCHIPS,
        labor_mix={SkillBucket.SCIENCE: 0.5, SkillBucket.ENGINEERING: 0.4, SkillBucket.UNSKILLED: 0.1},
        base_capacity=6,
    )
    cat["E3"] = BuildingArchetype(
        code="E3",
        name="Electronics Assembly",
        sector=Sector.ELECTRONICS,
        tech_field=TechField.ELECTRONICS,
        inputs={Good.MICROCHIPS: 1.1, Good.ENERGY: 0.5},
        output=Good.ELECTRONICS,
        labor_mix={SkillBucket.SCIENCE: 0.2, SkillBucket.ENGINEERING: 0.5, SkillBucket.UNSKILLED: 0.3},
        base_capacity=10,
    )
    cat["C1"] = BuildingArchetype(
        code="C1",
        name="Light Manufacturing",
        sector=Sector.LIGHT_INDUSTRY,
        tech_field=TechField.MATERIALS,
        inputs={Good.REFINED_METALS: 0.7, Good.ALLOYS: 0.3, Good.ENERGY: 0.4},
        output=Good.CONSUMER_GOODS,
        labor_mix={SkillBucket.ENGINEERING: 0.3, SkillBucket.LOGISTICS: 0.2, SkillBucket.UNSKILLED: 0.5},
        base_capacity=14,
    )
    cat["C2"] = BuildingArchetype(
        code="C2",
        name="Services & Entertainment",
        sector=Sector.SERVICES,
        tech_field=TechField.SOCIAL,
        inputs={Good.ENERGY: 0.2},
        output=Good.SERVICES,
        labor_mix={SkillBucket.SERVICES: 0.6, SkillBucket.LOGISTICS: 0.1, SkillBucket.UNSKILLED: 0.3},
        base_capacity=18,
    )
    cat["H1"] = BuildingArchetype(
        code="H1",
        name="Housing Construction",
        sector=Sector.CONSTRUCTION,
        tech_field=TechField.MATERIALS,
        inputs={Good.REFINED_METALS: 1.0, Good.ALLOYS: 0.2, Good.SERVICES: 0.2, Good.ENERGY: 0.4},
        output=Good.HOUSING,
        labor_mix={SkillBucket.ENGINEERING: 0.3, SkillBucket.UNSKILLED: 0.7},
        base_capacity=10,
    )
    cat["R1"] = BuildingArchetype(
        code="R1",
        name="Labs & Universities",
        sector=Sector.RESEARCH,
        tech_field=TechField.ELECTRONICS,
        inputs={Good.SERVICES: 0.3, Good.ENERGY: 0.4},
        output=Good.RESEARCH_POINTS,
        labor_mix={SkillBucket.SCIENCE: 0.7, SkillBucket.SERVICES: 0.2, SkillBucket.UNSKILLED: 0.1},
        base_capacity=5,
    )
    return cat


# --- Housing ----------------------------------------------------------------------


class HousingState(BaseModel):
    units: float = 0.0
    price: float = 1.0  # annual rent
    avg_hh_size: float = 3.0
    desired_space: float = 1.0  # units per household
    vacancy_rate: float = 0.0
    construction_cap: float = 5.0

    def update_price(self, population: float, credit: float = 1.0) -> None:
        households = population / max(0.1, self.avg_hh_size)
        demand = households * self.desired_space
        vacancy = max(0.0, self.units - demand) / max(1.0, self.units)
        self.vacancy_rate = vacancy
        excess = (demand - self.units) / max(1.0, self.units)
        kappa = 0.2
        growth = kappa * excess
        max_jump = 0.25
        self.price = max(0.1, min(self.price * (1 + max_jump), self.price * (1 + growth)))
        # construction incentive (affects elsewhere)


# --- Planet Economy ----------------------------------------------------------------


class PlanetEconomy(BaseModel):
    id: str
    population: PopulationPyramid = Field(default_factory=PopulationPyramid)
    education: EducationState = Field(default_factory=EducationState)
    labor: LaborMarketState = Field(default_factory=LaborMarketState)
    housing: HousingState = Field(default_factory=HousingState)
    buildings: List[BuildingInstance] = Field(default_factory=list)
    inventories: Dict[Good, float] = Field(default_factory=lambda: {g: 0.0 for g in Good})
    prices: Dict[Good, float] = Field(default_factory=lambda: {g: 1.0 for g in Good})
    target_inventory: Dict[Good, float] = Field(default_factory=lambda: {g: 20.0 for g in Good})
    tech_modifiers: Dict[TechField, float] = Field(default_factory=lambda: {f: 1.0 for f in TechField})
    qol: float = 0.6
    stability: float = 0.7
    credit_availability: float = 1.0

    def working_age(self) -> float:
        return self.population.working_age()

    def compute_qol(self, employment: float, housing_factor: float, food_ratio: float, consumer_ratio: float) -> float:
        crowding = 1 - min(1.0, (self.population.total() / max(1.0, self.housing.units)))
        w_food, w_consumer, w_jobs, w_stability, w_crowd, w_house = 0.25, 0.15, 0.2, 0.15, 0.1, 0.15
        q = (
            w_food * food_ratio
            + w_consumer * consumer_ratio
            + w_jobs * employment
            + w_stability * self.stability
            + w_crowd * crowding
            + w_house * housing_factor
        )
        self.qol = max(0.0, min(1.0, q))
        return self.qol

    # --- Production ----------------------------------------------------------------

    def produce(self) -> Dict[Good, float]:
        produced = {g: 0.0 for g in Good}
        consumed_inputs = {g: 0.0 for g in Good}
        for b in self.buildings:
            cap = b.capacity(self.tech_modifiers.get(b.archetype.tech_field, 1.0))
            # check inputs
            max_output_inputs = math.inf
            for g, req in b.archetype.inputs.items():
                available = self.inventories.get(g, 0.0)
                max_output_inputs = min(max_output_inputs, available / req if req > 0 else math.inf)
            potential = min(cap, max_output_inputs) * b.utilization
            if potential <= 0:
                continue
            for g, req in b.archetype.inputs.items():
                use = req * potential
                self.inventories[g] = max(0.0, self.inventories.get(g, 0.0) - use)
                consumed_inputs[g] += use
            produced[b.archetype.output] += potential
        # add outputs
        for g, qty in produced.items():
            self.inventories[g] = self.inventories.get(g, 0.0) + qty
        return produced

    def consume_population_goods(self) -> Dict[Good, float]:
        pop = self.population.total()
        needs = {
            Good.PROCESSED_FOOD: pop * 0.02,  # per tick (week)
            Good.CONSUMER_GOODS: pop * 0.01,
            Good.SERVICES: pop * 0.01,
            Good.ENERGY: pop * 0.015,
        }
        consumed = {g: 0.0 for g in Good}
        for g, demand in needs.items():
            available = self.inventories.get(g, 0.0)
            take = min(available, demand)
            consumed[g] = take
            self.inventories[g] = available - take
        return consumed

    def update_prices(self) -> None:
        alpha = 0.2
        for g in Good:
            stock = self.inventories.get(g, 0.0)
            target = self.target_inventory.get(g, 1.0)
            ratio = stock / max(1.0, target)
            imbalance = 1 - ratio
            new_price = self.prices.get(g, 1.0) * (1 + alpha * imbalance)
            # clamp
            self.prices[g] = max(0.1, min(new_price, 10 * self.prices.get(g, 1.0)))

    def housing_step(self) -> None:
        self.housing.update_price(self.population.total(), credit=self.credit_availability)

    def labor_step(self) -> None:
        # crude demand from buildings: sum labor_mix * capacity
        demand = {b: 0.0 for b in SkillBucket}
        for inst in self.buildings:
            cap = inst.capacity(self.tech_modifiers.get(inst.archetype.tech_field, 1.0)) * inst.utilization
            for bucket, share in inst.archetype.labor_mix.items():
                demand[bucket] += cap * share
        supply = {b: self.education.skilled.get(b, 0.0) for b in SkillBucket}
        supply[SkillBucket.UNSKILLED] += self.education.unskilled

        excess = {}
        for b in SkillBucket:
            ls = supply.get(b, 0.0)
            ld = demand.get(b, 0.0)
            self.labor.unemployment[b] = max(0.0, ls - ld)
            self.labor.vacancies[b] = max(0.0, ld - ls)
            excess[b] = (ld - ls) / max(1.0, ls)
        self.labor.update_wages(excess, productivity=0.01)

    def qol_components(self) -> Tuple[float, float, float]:
        pop = self.population.total()
        food_ratio = min(1.0, self.inventories.get(Good.PROCESSED_FOOD, 0.0) / max(1.0, pop * 0.02))
        consumer_ratio = min(1.0, self.inventories.get(Good.CONSUMER_GOODS, 0.0) / max(1.0, pop * 0.01))
        employment = 1.0 - (
            sum(self.labor.unemployment.values()) / max(1.0, self.education.unskilled + self.working_age())
        )
        # Housing factor from burden
        avg_wage = sum(self.labor.wages[b] * (self.education.skilled.get(b, 0.0)) for b in SkillBucket) / max(
            1.0, self.working_age()
        )
        income_per_household = avg_wage * 1.2  # assume ~1.2 earners/household
        housing_to_income = self.housing.price / max(1.0, income_per_household)
        target_burden = 0.3
        over = max(0.0, housing_to_income - target_burden)
        housing_factor = max(0.0, 1 - 2.0 * over)
        return food_ratio, consumer_ratio, housing_factor

    def econ_tick(self) -> None:
        self.produce()
        self.consume_population_goods()
        self.update_prices()
        self.labor_step()
        self.housing_step()
        food_ratio, consumer_ratio, housing_factor = self.qol_components()
        employment = 1.0 - (
            sum(self.labor.unemployment.values()) / max(1.0, self.education.unskilled + self.working_age())
        )
        self.compute_qol(employment, housing_factor, food_ratio, consumer_ratio)

    def demography_tick(self) -> None:
        density = self.population.total() / max(1.0, self.housing.units)
        next_pop = self.population.yearly_advance(self.qol, density)
        births = self.population.births(self.qol)
        next_pop.cohorts[0] += births
        self.population = next_pop
        self.education.graduate(grad_rate=0.25)


# --- Tech & Government -------------------------------------------------------------


class TechState(BaseModel):
    level: float = 1.0
    econ_progress: float = 0.0
    acad_progress: float = 0.0
    breakthroughs: List[str] = Field(default_factory=list)

    def step(self, econ_input: float, acad_input: float) -> None:
        self.econ_progress += econ_input / (1 + max(0, self.level - 1) ** 2)
        self.acad_progress += acad_input
        # tech level rises slowly with academic progress
        self.level += 0.001 * math.log1p(self.acad_progress)


class Budget(BaseModel):
    revenues: float = 0.0
    expenditures: float = 0.0
    debt: float = 0.0
    credit_availability: float = 1.0

    def settle(self) -> None:
        deficit = self.expenditures - self.revenues
        self.debt += deficit
        # Interest adjusts credit stance slightly
        self.credit_availability = max(0.5, min(1.5, 1.0 - 0.00001 * self.debt))
        self.revenues = 0.0
        self.expenditures = 0.0


# --- Empire Economy ----------------------------------------------------------------


class EmpireEconomy(BaseModel):
    planets: List[PlanetEconomy] = Field(default_factory=list)
    budget: Budget = Field(default_factory=Budget)
    tech: Dict[TechField, TechState] = Field(default_factory=lambda: {f: TechState() for f in TechField})

    def trade_step(self) -> None:
        # Simple matching: for each good, move surplus to deficits based on price
        for g in Good:
            exporters = []
            importers = []
            for p in self.planets:
                stock = p.inventories.get(g, 0.0)
                target = p.target_inventory.get(g, 10.0)
                surplus = stock - target
                if surplus > 0.1:
                    exporters.append((p, surplus, p.prices.get(g, 1.0)))
                elif surplus < -0.1:
                    importers.append((p, -surplus))
            exporters.sort(key=lambda x: x[2])
            for importer, need in importers:
                for i, (exporter, surplus, price) in enumerate(list(exporters)):
                    move = min(surplus, need)
                    if move <= 0:
                        continue
                    exporter.inventories[g] -= move
                    importer.inventories[g] += move
                    exporters[i] = (exporter, surplus - move, price)
                    need -= move
                    if need <= 0:
                        break

    def econ_tick(self) -> None:
        # Planetary steps
        for p in self.planets:
            p.credit_availability = self.budget.credit_availability
            p.econ_tick()
        # Trade
        self.trade_step()
        # Tech accumulation (aggregate)
        for field in TechField:
            industry_activity = sum(
                sum(inst.capacity(p.tech_modifiers.get(inst.archetype.tech_field, 1.0)) for inst in p.buildings)
                for p in self.planets
                if any(inst.archetype.tech_field == field for inst in p.buildings)
            )
            acad_workers = sum(p.education.skilled.get(SkillBucket.SCIENCE, 0.0) for p in self.planets)
            self.tech[field].step(
                econ_input=industry_activity * 0.01,
                acad_input=(acad_workers**0.85) * 0.05,
            )
        # Budget settle placeholder
        self.budget.settle()

    def demography_tick(self) -> None:
        for p in self.planets:
            p.demography_tick()
