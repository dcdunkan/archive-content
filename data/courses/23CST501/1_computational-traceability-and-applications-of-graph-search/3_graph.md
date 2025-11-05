# Graph

- Graph is a non-linear data structure consisting of vertices and edges.
  $\mathrm { G } = ( \mathrm { V } , \mathrm { E } )$
- Two most common ways to represent a graph

1. Adjacency Matrix : representing a graph as a matrix of boolean (0's and 1’s)

![Graph Representation of Undirected graph to Adjacency Matrix](images/012e2070718086701cda3dd157605f95d27f4f67aecace0ebcf1d5c1d1cf4d5e.jpg "Graph Representation of Undirected graph to Adjacency Matrix")

If there is an edge from vertex i to j, mark adjMat[i][j] as 1.

If there is no edge from vertex i to j, mark adjMat[i][j] as 0.

2. Adjacency list : An array of Lists is used to store edges between two
   vertices.

Linked list

adjList[0] will have all the nodes which are connected (neighbour) to vertex 0.

adjList[1] will have all the nodes which are connected (neighbour) to vertex 1
and so on.

![Graph Representation of Undirected graph to Adjacency List](images/7fcf1a83c0a212e8beb7c5a04e85f8cf60387b70c0a58eacb6a8f7844c86bf2d.jpg "Graph Representation of Undirected graph to Adjacency List")

![Graph Representation of Directed graph to Adjacency List](images/f195f41b589a8dc5a9c45c0ceac0588d6809da461cbda04e6f10c534117ab47a.jpg "Graph Representation of Directed graph to Adjacency List")

## Types of Graph

1. Directed graph $\longrightarrow$ directed edges only
2. Undirected graph $\longrightarrow$ undirected edges
3. Directed acyclic graph $\mathrm { ( D A G ) } \longrightarrow$ directed graph
   with no cycles
4. Cyclic graph $\longrightarrow$ directed graph with atleast 1 cycle
5. Weighted graph $\longrightarrow$ edges is having weight
6. Disconnected graph $\longrightarrow$ undirected graph that is not connected

![Weighted Graph](images/7b1139124590417a12895268153e6a9699553a941ba2e86c19fe66cad60eaf88.jpg "Weighted Graph")

![Disconnected Graph](images/c25475b89e4a32c124e312fab2b5f58380cefb67c7279347666aa26e8adc5488.jpg "Disconnected Graph")

![Undirected Graph](images/a01d60324fe6a1339f5c82e2ed87b9ae5f24a8d64fe6da8b7590dda68d3cb608.jpg "Undirected Graph")

![Directed Graph](images/a01d60324fe6a1339f5c82e2ed87b9ae5f24a8d64fe6da8b7590dda68d3cb608a.jpg "Directed Graph")

![Directed Acyclic Graph](images/a01d60324fe6a1339f5c82e2ed87b9ae5f24a8d64fe6da8b7590dda68d3cb608b.jpg "Directed Acyclic Graph")

![Cyclic Graph](images/b225cf053b7f8575a96303f2c3f560490682346c40dff56bf0950a0d47df2327.jpg "Cyclic Graph")
