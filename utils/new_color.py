import json
import math
import random

def euclidean_distance(color1, color2):
    """Calculate the Euclidean distance between two RGB colors."""
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(color1, color2)))

def luminance(color):
    """Calculate the luminance of a color."""
    return 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]

def is_unique_color(new_color, existing_colors, uniqueness_threshold):
    """Check if the new color is unique compared to existing colors."""
    for color in existing_colors:
        if euclidean_distance(new_color, color) < uniqueness_threshold:
            return False
    return True

def generate_unique_color(existing_colors, brightness_threshold, uniqueness_threshold):
    """Generate a unique color that is not too dark."""
    while True:
        new_color = [random.randint(0, 255) for _ in range(3)]
        if luminance(new_color) >= brightness_threshold and is_unique_color(new_color, existing_colors, uniqueness_threshold):
            return new_color

def main():
    # Read JSON file
    with open('countries.json', 'r') as file:
        data = json.load(file)

    # Extract colors
    existing_colors = [item['color'] for item in data]

    # Define a brightness threshold and uniqueness threshold (can be adjusted)
    brightness_threshold = 100  # Adjust this value as needed
    uniqueness_threshold = 50   # Adjust this value based on desired uniqueness

    # Generate unique color
    unique_color = generate_unique_color(existing_colors, brightness_threshold, uniqueness_threshold)
    print(f"Generated unique color: {unique_color}")

if __name__ == "__main__":
    main()
