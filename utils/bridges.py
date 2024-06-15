import numpy as np
import json, codecs
import random
import time
import networkx as nx

def upsert_lane(lane, graph: nx.Graph):
    for star in lane:
        if not graph.has_node(star):
            graph.add_node(star)
    graph.add_edge(lane[0], lane[1])

def save_graph(graph, filename):
    data = nx.node_link_data(graph)
    with open(filename, 'w') as file:
        json.dump(data, file)

def calculate_strategic_value(graph):
    # Calculate node betweenness centrality
    betweenness = nx.betweenness_centrality(graph)
    return betweenness
    # Sort systems by betweenness centrality (strategic value)
    sorted_systems = sorted(betweenness, key=betweenness.get, reverse=True)

    # Select the top systems as choke points
    choke_points = sorted_systems

    return choke_points



if __name__ == "__main__":
    graph = nx.Graph()
    galaxy = json.load(open("galaxy.json"))
    systems = galaxy['ownership'][9]['systems'] #+ galaxy['ownership'][10]['systems']
    for lane in galaxy['hyperlanes']:
        if lane[0] in systems and lane[1] in systems:
            upsert_lane(lane, graph)
    
    # Calculate strategic value (choke points)
    choke_points = calculate_strategic_value(graph)
    # Print the choke points
    print("Choke Points:")
    scale = max(choke_points.values())
    for key, value in choke_points.items():
        choke_points[key] = value / scale
    print(choke_points)