import json
import numpy as np
from enum import Enum
import os

# galaxy = json.load(open('galaxy.json'))
# countries = json.load(open('countries.json'))
# resources = json.load(open('resources.json'))

GRAVITATIONAL_CONSTANT = 6.67430 * (10 ** -11)

class StarType(Enum):
    O = 1
    B = 2
    A = 3
    F = 4
    G = 5
    K = 6
    M = 7

class Star():
    def __init__(self, star_idx: int, galaxy: dict):
        """Initialize a Star with all information for a given index

        Args:
            star_idx (int): Index of the star in galaxy['stars']
        """
        if galaxy['stars'][star_idx][0] < 0 or galaxy['stars'][star_idx][1] < 0:
            return None
        seed = int(f"{galaxy['stars'][star_idx][0]}{galaxy['stars'][star_idx][1]}"[::-1])
        self.rng = np.random.default_rng(seed)
        self.idx = star_idx
        
        self.classification = self.rng.choice(
            [StarType.O, StarType.B, StarType.A, StarType.F, StarType.G, StarType.K, StarType.M],
            p=[0.0000003, 0.0012, 0.0061, 0.03, 0.076, 0.12, 0.7666997]
        )
        
        match self.classification:
            case StarType.O:                
                self.temperature = max(self.rng.gamma(10, 10), 30) * 1000
                self.solar_mass = max(self.rng.gamma(10, 10), 16)
                self.solar_radius = max(self.rng.gamma(5.198, 10),6.6)
            case StarType.B:
                self.temperature = self.rng.uniform(10, 30) * 1000
                self.solar_mass = self.rng.uniform(2.1, 16)
                self.solar_radius = self.rng.uniform(1.8, 6.6)
            case StarType.A:
                self.temperature = self.rng.uniform(7.5, 10) * 1000
                self.solar_mass = self.rng.uniform(1.4, 2.1)
                self.solar_radius = self.rng.uniform(1.4, 1.8)
            case StarType.F:
                self.temperature = self.rng.uniform(6, 7.5) * 1000
                self.solar_mass = self.rng.uniform(1.04, 1.4)
                self.solar_radius = self.rng.uniform(1.15, 1.4)
            case StarType.G:
                self.temperature = self.rng.uniform(5.2, 6) * 1000
                self.solar_mass = self.rng.uniform(0.8, 1.04)
                self.solar_radius = self.rng.uniform(0.96, 1.15)
            case StarType.K:
                self.temperature = self.rng.uniform(3.7, 5.2) * 1000
                self.solar_mass = self.rng.uniform(0.45, 0.8)
                self.solar_radius = self.rng.uniform(0.7, 0.96)
            case StarType.M:
                self.temperature = self.rng.uniform(2.4, 3.7) * 1000
                self.solar_mass = self.rng.uniform(0.08, 0.45)
                self.solar_radius = self.rng.uniform(0.4, 0.7)    

        max_bodies = self.rng.integers(5, 10)  # Total number of celestial bodies

        if self.classification in [StarType.O, StarType.B]:
            prob_terrestrial = 0.1  # Low probability of terrestrial planets
            prob_asteroid_belt = 0.1  # Low probability of asteroid belts
        elif self.classification in [StarType.A, StarType.F, StarType.G]:
            prob_terrestrial = 0.5  # Balanced probability
            prob_asteroid_belt = 0.3  # Moderate probability
        else:
            prob_terrestrial = 0.7  # High probability of terrestrial planets
            prob_asteroid_belt = 0.5  # High probability of asteroid belts

        self.bodies = []

        for i in range(max_bodies):
            rand = self.rng.random()
            if rand < prob_terrestrial:
                if self.classification in [StarType.O, StarType.B]:
                    self.bodies.append(None)
                else:
                    self.bodies.append(Planet(self, i, galaxy))
            elif rand < prob_terrestrial + prob_asteroid_belt:
                self.bodies.append(AsteroidBelt(self, i))
            else:
                self.bodies.append(Planet(self, i))
                
    @property
    def radius_m(self):
        return self.solar_radius * 695700 * 1000
    
    @property
    def luminosity(self) -> float:
        """Get the Luminosity of the star

        Returns:
            float: The Luminosity of this star
        """
        stefan_boltzmann_constant = 5.67e-8
        return 4 * np.pi * (self.radius_m ** 2) * stefan_boltzmann_constant * (self.temperature ** 4)
    
    def temp_at_dist(self, dist_m) -> float:
        """Determine the temperature in Kelvin from this star at a given distance in meters

        Args:
            dist_m (float): Distance from the star's center in meters

        Returns:
            float: Temperature in Kelvin
        """
        return self.temperature * np.sqrt(self.radius_m / (2 * dist_m))
    
    def dist_for_temp(self, temp_k):
        """Returns the distance in kilometers to achieve a target temperature

        Args:
            temp_k (float): Temperature to reach in Kelvin

        Returns:
            float: Distance in km to reach that temperature
        """
        temp_ratio = temp_k / self.temperature
        return self.radius_m / (2 * (temp_ratio ** 2))

    def to_dict(self):
        return {
            'classification': self.classification.name,
            'bodies': [b.to_dict() if hasattr(b, 'to_dict') else None for b in self.bodies]
        }


class AsteroidBelt():
    def __init__(self, star: Star, order):
        self.star = star
        self.order = order

class PlanetType(Enum):
    TERRESTRIAL = 1
    GAS_GIANT = 2
    ICE_GIANT = 3

class Planet():
    def __init__(self, star: Star, order, galaxy: dict):
        if galaxy['stars'][star.idx][0] < 0 or galaxy['stars'][star.idx][1] < 0:
            return None
        self.seed = int(f"{galaxy['stars'][star.idx][0]}{galaxy['stars'][star.idx][1]}{order}"[::-1])
        self.rng = np.random.default_rng(self.seed)
        
        # Distance from star (AU)
        self.dist = (0.5 * order) - np.clip(self.rng.normal(0.25, 0.225), a_min=0.05, a_max=0.45)
        self.dist = max(0.04, self.dist)     
        self.star_luminosity = star.luminosity  

        # Orbital Period (days)
        self.orbit_period = max(10 ** self.rng.normal(2.5, 0.5), 10)
        
        # In Kelvin
        self.temp_from_star = star.temp_at_dist(self.dist * 1.496e+11)
        self.habitable_temp = self.temp_from_star > 175 and self.temp_from_star < 290
        
        self.active_core = self.rng.random() > 0.05       
            
        self.is_terrestrial = self.temp_from_star < 1000 and self.temp_from_star > 175
        
        self.water_content = self.rng.uniform(0, 1) ** 2 if self.temp_from_star < 320 else 0        
        
        if not self.is_terrestrial:
            if self.temp_from_star < 80 or self.water_content > 0.7:
                # Ice Giant; Liquid
                self.earth_mass = self.rng.uniform(10, 25)
                self.density = self.rng.uniform(1, 1.5)
                self.classification = PlanetType.ICE_GIANT
                self.albedo = self.rng.uniform(0.5, 0.8)
            else:
                # Gas Giant
                self.earth_mass = self.rng.uniform(90, 600)
                self.density = self.rng.uniform(0.7, 1.2)
                self.classification = PlanetType.GAS_GIANT
                self.albedo = self.rng.uniform(0.3, 0.5)
        else:
            self.earth_mass = self.rng.uniform(0.1, 10)  
            self.density = self.rng.uniform(4, 6)
            self.classification = PlanetType.TERRESTRIAL
            
            if self.water_content > 0.5:
                self.albedo = self.rng.uniform(0.2, 0.3)  # Oceans
            elif self.water_content > 0.2:
                self.albedo = self.rng.uniform(0.25, 0.35)  # Mixed terrain
            else:
                self.albedo = self.rng.uniform(0.1, 0.2)  # Rocky terrain               
        
        self.albedo = min(max(self.albedo, 0.0), 1.0)
        
        self.density *= 1000 # kg / m^3
        
        #self.mass_kg = self.earth_mass * 5.972e24        
        
        self.radius = np.cbrt(self.planet_volume / ((4/3) * np.pi)) / 1000 # Radius in km                
        
        # Rotational period (earth days)
        # Minimum- any lower than this and the planet is at risk of ripping itself apart
        min_rot_period = (2 * np.pi / (np.sqrt(GRAVITATIONAL_CONSTANT * self.mass_kg / ((self.radius*1000)**3)))) / 86400
        # Based on 10-50 day range
        self.rotational_period = max(min_rot_period, self.rng.normal(30, 30))
        
        if self.dist > 0.1 and self.active_core:
            match self.classification:
                case PlanetType.TERRESTRIAL:                    
                    self.atmospheric_pressure = self.rng.exponential(10)
                case PlanetType.GAS_GIANT:
                    self.atmospheric_pressure = self.rng.uniform(100, 1000)
                case PlanetType.ICE_GIANT:
                    self.atmospheric_pressure = self.rng.uniform(0.5, 3)            
        else:
            self.atmospheric_pressure = 0

    def to_dict(self):
        return {
            'classification': self.classification.name,
            'dist': self.dist,
            'albedo': self.albedo,
        }
    
    @property
    def planet_volume(self):
        return (self.mass_kg) / self.density
    
    @property
    def mass_kg(self):
        return self.earth_mass * 5.972e24
    
    @property
    def angular_velocity(self):
        # Angular velocity around the star, rad / s
        return (2 * np.pi) / (self.orbit_period * 86400)
    
    @property
    def linear_velocity(self):
        # Linear velocity at any point in orbit, km / s
        return (2 * np.pi * self.dist * 1.496 * (10 ** 8)) / (self.orbit_period * 24)
    
    @property
    def gravity(self):
        # gravitational acceleration
        # ~9.8 m/s^2 on earch
        # https://assets-eu.researchsquare.com/files/rs-859954/v1_covered.pdf?c=1630422506
        rot_p_sec = self.rotational_period * 86400
        rad_m = self.radius * 1000
        term1 = GRAVITATIONAL_CONSTANT * self.mass_kg / (rad_m**2)
        #term2 = 4*(np.pi**2)*rad_m / (rot_p_sec**2)
        return term1 #- term2
    
    @property
    def surface_gravity(self):
        # The actual gravitational pull experienced on the surface
        # Slightly less due to planetary rotation
        rot_p_sec = self.rotational_period * 86400
        rad_m = self.radius * 1000
        term1 = GRAVITATIONAL_CONSTANT * self.mass_kg / (rad_m**2)
        term2 = 4*(np.pi**2)*rad_m / (rot_p_sec**2)
        return term1 - term2
    
    @property
    def escape_velocity(self):
        # Escape velocity in m/s
        return np.sqrt(2 * GRAVITATIONAL_CONSTANT * self.mass_kg / (self.radius * 1000))
    
    @property
    def equilibrium_temp(self):
        return self.temp_from_star * (1 - self.albedo) ** 0.25
    
    @property
    def greenhouse_effect(self):
        if self.atmospheric_pressure <= 0:
            return 0
        
        # This is just scaled to earth values- only really works for terrestrial planets
        return 33 * self.atmospheric_pressure * (self.gravity / 9.78)
    
    @property
    def surface_temp_range(self):        
        surface_temp = self.equilibrium_temp + self.greenhouse_effect
        
        day_temp = surface_temp + 10/np.sqrt(self.rotational_period)
        night_temp = surface_temp - 10/np.sqrt(self.rotational_period)
        return day_temp, night_temp  
    
    @property
    def is_habitable(self):
        # Mass must be above 0.4 Earth Masses to maintain a nitrogen-oxygen atmosphere
        # Mass above 1.5 Earth masses is unsustainable to humans
        return self.is_terrestrial and self.habitable_temp and self.active_core and self.earth_mass >= 0.4 and self.earth_mass <= 1.5

    
    # def texture(self):
    #     base_folder = os.path.join('static', 'textures', 'sources', self.classification.name.upper())
    #     sources = [x[0] for x in os.walk(base_folder)]
    #     source_folder = self.rng.choice(sources)

    #     diffuse_img = cv2.imread(os.path.join(source_folder, 'diffuse.jpg'), cv2.IMREAD_COLOR)
    #     bump_img = cv2.imread(os.path.join(source_folder, 'bump.jpg'), cv2.IMREAD_GRAYSCALE)

    #     # Modify texture based on planet properties
    #     # This is simplified and would need more complex logic for realistic textures
    #     if self.is_terrestrial:
    #         histogram, _ = np.histogram(bump_img, bins=256, range=(0, 256))
    #         cdf = histogram.cumsum()
    #         cdf_normalized = cdf * float(histogram.max()) / cdf.max()
    #         threshold = np.searchsorted(cdf_normalized, cdf_normalized[-1] * self.water_content)
    #         specular_map = cv2.invert(cv2.threshold(bump_img, threshold))
            

    #     # Generate specular map from the diffuse map
    #     specular_map = None
    #     pass
        



class Technology():
    pass

class PolicyVector():
    pass

class Interest():
    """Vector of Interests in various economic sectors.
    Maintains state as to whether this is a "comitted" interest or not.
    Includes convenience functions for influences and changes. 
    """
    pass

class Country():
    def __init__(self, name, color, technology = None, policies = None, vips = None):
        self.name = name
        self.color: list[float] = color
        
        self.technology: list[int] = [] if technology is None else technology
        self.policies: PolicyVector = [] if policies is None else policies
        
        self.vips: list[Interest] = [] if vips is None else vips
