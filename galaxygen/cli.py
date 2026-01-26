from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer

from .config import (
    DEFAULT_COUNTRIES,
    DEFAULT_DISTRIBUTION,
    DEFAULT_GALAXY,
    DEFAULT_RESOURCES,
)
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
        DEFAULT_RESOURCES, "--resources", "-r", help="Path to resource definitions JSON."
    ),
    output: Path = typer.Option(DEFAULT_GALAXY, "--output", "-o", help="Where to save the generated galaxy JSON."),
    seed: Optional[int] = typer.Option(None, "--seed", help="Random seed for reproducible outputs."),
) -> None:
    resource_defs = load_resource_definitions(resources) if resources.exists() else []
    galaxy = generate_galaxy(distribution, system_count, resource_defs, seed)
    save_galaxy(output, galaxy)
    typer.echo(f"Galaxy created with {len(galaxy.stars)} systems and {len(galaxy.hyperlanes)} lanes -> {output}")


@app.command()
def render(
    galaxy_path: Path = typer.Option(DEFAULT_GALAXY, "--galaxy", "-g", help="Galaxy JSON to render."),
    output_dir: Path = typer.Option(
        DEFAULT_GALAXY.parent, "--output-dir", "-o", help="Where to place rendered images."
    ),
    distribution: Path = typer.Option(
        DEFAULT_DISTRIBUTION, "--distribution", "-d", help="Density map to mask overlays."
    ),
    resources: Path = typer.Option(
        DEFAULT_RESOURCES, "--resources", "-r", help="Resource definitions JSON."
    ),
    countries: Path = typer.Option(
        DEFAULT_COUNTRIES, "--countries", "-c", help="Country definitions JSON."
    ),
) -> None:
    galaxy = load_galaxy(galaxy_path)
    resource_defs = load_resource_definitions(resources) if resources.exists() else []
    country_defs = load_country_definitions(countries) if countries.exists() else []
    outputs = render_galaxy(galaxy, resource_defs, country_defs, output_dir, distribution)
    typer.echo(f"Rendered galaxy -> {outputs['final']}")


@app.command()
def info(galaxy_path: Path = typer.Option(DEFAULT_GALAXY, "--galaxy", "-g")) -> None:
    galaxy = load_galaxy(galaxy_path)
    typer.echo(
        f"Galaxy {galaxy.width}x{galaxy.height} | {len(galaxy.stars)} stars | "
        f"{len(galaxy.hyperlanes)} hyperlanes | {len(galaxy.resources)} resources | "
        f"{len(galaxy.ownership)} countries"
    )


if __name__ == "__main__":
    app()
