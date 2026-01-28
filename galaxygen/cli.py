from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer

from .config import DEFAULT_DISTRIBUTION, DEFAULT_GALAXY
from .generation import generate_galaxy
from .rendering import render_galaxy
from .storage import (
    load_country_definitions,
    load_galaxy,
    load_resource_definitions,
    save_galaxy,
)

app = typer.Typer(help="GalaxyGen CLI toolkit.")


@app.command()
def generate(
    system_count: int = typer.Argument(..., help="Number of systems to generate."),
    distribution: Path = typer.Option(
        DEFAULT_DISTRIBUTION, "--distribution", "-d", help="Path to the density map image."
    ),
    resources: Path = typer.Option(
        DEFAULT_GALAXY,
        "--resources",
        "-r",
        help="Unused (MongoDB storage). Resource definitions are loaded from the database.",
    ),
    output: Path = typer.Option(
        DEFAULT_GALAXY,
        "--output",
        "-o",
        help="Unused (MongoDB storage). Generated galaxies are stored in the database.",
    ),
    seed: Optional[int] = typer.Option(None, "--seed", help="Random seed for reproducible outputs."),
) -> None:
    resource_defs = load_resource_definitions()
    country_defs = load_country_definitions()
    galaxy = generate_galaxy(distribution, system_count, resource_defs, seed, country_defs)
    save_galaxy(None, galaxy)
    typer.echo(
        f"Galaxy created with {len(galaxy.stars)} systems and {len(galaxy.hyperlanes)} lanes in MongoDB."
    )


@app.command()
def render(
    galaxy_path: Path = typer.Option(
        DEFAULT_GALAXY,
        "--galaxy",
        "-g",
        help="Unused (MongoDB storage). Galaxy data is loaded from the database.",
    ),
    output_dir: Path = typer.Option(
        DEFAULT_GALAXY.parent, "--output-dir", "-o", help="Where to place rendered images."
    ),
    distribution: Path = typer.Option(
        DEFAULT_DISTRIBUTION, "--distribution", "-d", help="Density map to mask overlays."
    ),
    resources: Path = typer.Option(
        DEFAULT_GALAXY,
        "--resources",
        "-r",
        help="Unused (MongoDB storage). Resource definitions are loaded from the database.",
    ),
    countries: Path = typer.Option(
        DEFAULT_GALAXY,
        "--countries",
        "-c",
        help="Unused (MongoDB storage). Country definitions are loaded from the database.",
    ),
) -> None:
    galaxy = load_galaxy()
    resource_defs = load_resource_definitions()
    country_defs = load_country_definitions()
    outputs = render_galaxy(galaxy, resource_defs, country_defs, output_dir, distribution)
    typer.echo(f"Rendered galaxy -> {outputs['final']}")


@app.command()
def info(
    galaxy_path: Path = typer.Option(
        DEFAULT_GALAXY,
        "--galaxy",
        "-g",
        help="Unused (MongoDB storage). Galaxy data is loaded from the database.",
    )
) -> None:
    galaxy = load_galaxy()
    typer.echo(
        f"Galaxy {galaxy.width}x{galaxy.height} | {len(galaxy.stars)} stars | "
        f"{len(galaxy.hyperlanes)} hyperlanes | {len(galaxy.resources)} resources | "
        f"{len(galaxy.countries)} countries"
    )


if __name__ == "__main__":
    app()
