import numpy as np
import json, codecs
import random
import time
import networkx as nx
from itertools import combinations
from tqdm import tqdm

def upsert_lane(lane, graph: nx.Graph):
    for star in lane:
        if not graph.has_node(star):
            graph.add_node(star)
    graph.add_edge(lane[0], lane[1])

def save_graph(graph, filename):
    data = nx.node_link_data(graph)
    with open(filename, 'w') as file:
        json.dump(data, file)

def calculate_node_scores(graph):
    # Run Floyd-Warshall algorithm to get all pairs shortest path
    # NetworkX returns a generator of (source, target, {'path': [...], 'weight': ...}) for each source and target
    all_pairs_shortest_path = dict(nx.all_pairs_dijkstra_path(graph))
    
    # Initialize score for each node
    scores = {node: 0 for node in graph.nodes()}
    
    # Count how many paths go through each node
    for source in graph.nodes():
        for target in graph.nodes():
            if source != target:
                if source not in all_pairs_shortest_path or target not in all_pairs_shortest_path[source]:
                    continue
                path = all_pairs_shortest_path[source][target]
                for node in path:
                    if node != source and node != target:
                        scores[node] += 1

    return scores


def find_all_simple_paths_for_all_pairs(graph):
    all_paths = {}
    scores = {}
    for source, target in tqdm(list(combinations(graph.nodes, 2))):  # Get all unique pairs of nodes
        # Find all simple paths between source and target
        paths = list(nx.all_simple_paths(graph, source, target))
        if paths:  # Only add to the dictionary if there is at least one path
            all_paths[(source, target)] = paths
            
    for key, value in all_paths.items():
        for path in value:
            for sys in path:
                if sys in scores:
                    scores[sys] += 1
                else:
                    scores[sys] = 1
            
    return scores

def node_degrees(graph):
    # This function returns a dictionary with nodes as keys and their degrees as values
    return dict(graph.degree())

if __name__ == "__main__":
    graph = nx.Graph()
    galaxy = json.load(open("galaxy.json"))
    systems = galaxy['ownership'][6]['systems'] # + galaxy['ownership'][10]['systems']
    for lane in galaxy['hyperlanes']:
        if lane[0] in systems and lane[1] in systems:
            upsert_lane(lane, graph)
    
    # Calculate strategic value (choke points)
    choke_points = node_degrees(graph)
    # Print the choke points
    print("Choke Points:")
    scale = max(choke_points.values())
    for key, value in choke_points.items():
        choke_points[key] = value / scale
    print(choke_points)
