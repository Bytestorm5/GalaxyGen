import numpy as np
import json, codecs
import random
import time
import networkx as nx
from collections import deque
from queue import PriorityQueue
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

def bfs(start_node, evaluation_func, get_child_nodes, depth_limit, heuristic):
    visited = set()
    queue = PriorityQueue()
    queue.put((heuristic(start_node), start_node))
    print(f"BASE EVAL: {evaluation_func(start_node)}")
    max_node = None
    max_eval = float('inf')

    pbar = tqdm(total=1, desc="Best-First Search")

    while not queue.empty():
        heuristic_score, node = queue.get()
        node = tuple(set(node))
        pbar.update(1)

        if (heuristic_score, node) in visited or len(node) > depth_limit:
            continue

        visited.add((heuristic_score, node))
        
        eval_score = heuristic_score #evaluation_func(node)
        if eval_score < max_eval:
            max_eval = eval_score
            max_node = node
            print(f'NEW BEST: {max_node} @ {max_eval} w/ {len(node) / 13} ex. || H: {heuristic_score}')

        if len(node) < depth_limit:
            child_nodes = get_child_nodes(node)
            for child in child_nodes:
                if (heuristic(child), child) not in visited:
                    queue.put((heuristic(child), child))
                    pbar.total += 1
    pbar.close()
    return max_node

def tuple_in_list(target_tuple, tuple_list):
    target_set = set(target_tuple)
    for tup in tuple_list:
        if set(tup) == target_set:
            return True
    return False

START_POS = []
OCCUPIED = set()
GRAPH = nx.Graph()

def eval_state(node: tuple):    
    total_owned = set(START_POS + list(node))
    eval = len(total_owned)

    for star in total_owned:
        neighbors = set(GRAPH.neighbors(star))
        if not neighbors.issubset(total_owned):
            eval -= 2
    
    return -eval

def heuristic(node: tuple):
    return -(sum([len(list(GRAPH.neighbors(star))) for star in node]) + len(node))

def generate_child_nodes(node: tuple):
    NODE = list(node)
    total_owned = START_POS + NODE
    neighbors = set()

    for star in total_owned:
        for n in GRAPH.neighbors(star):
            neighbors.add(n)
    
    for neighbor in neighbors:
        if neighbor in OCCUPIED or neighbor in NODE:
            continue
        child_node = NODE + [neighbor]
        yield tuple(child_node)

if __name__ == "__main__":
    galaxy = json.load(open("galaxy.json"))
    for lane in galaxy['hyperlanes']:
        upsert_lane(lane, GRAPH)
    
    START_POS = galaxy['ownership'][9]['systems']
    OCCUPIED = []
    for i in range(len(galaxy['ownership'])):
        OCCUPIED += galaxy['ownership'][i]['systems']
    OCCUPIED = set(OCCUPIED)
    LANES = galaxy['hyperlanes']
    print(f'STARTING FROM {len(START_POS)} SYSTEMS')

    best = bfs(tuple([]), eval_state, generate_child_nodes, 13, eval_state)
    print(best)
