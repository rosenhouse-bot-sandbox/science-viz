# Graph layout: realism

This page draws algorithms, not physics. Here realism means that the picture shows the graph that was given and what the method did to it. Each heading is a rule. Under it is what follows on screen.

## The picture is the graph

- Every node and every edge in the data is drawn once. Nothing else is drawn as a node or an edge.
- An edge starts on the node it leaves and ends on the node it enters. Its arrowhead is at the node it enters.
- An edge that was turned round to break a cycle is still drawn in its true direction.
- A group's box holds its own members and no others. Two boxes overlap only when one is inside the other.
- Nodes do not overlap. An edge does not run through a node it does not join.

## A layered layout keeps what each step decided

The method works in order: break cycles, give each node a layer, order each layer, place the nodes, route the edges.

- After the first step no cycle is left.
- Every edge runs from a lower layer to a higher one. An edge that spans several layers passes through a place of its own in each layer it crosses.
- The ordering step moves nodes within their layer only. No node changes layer after layers are given.
- Placing nodes keeps the order. Routing keeps the places.
- The crossings on screen are the crossings that the order gives.

## A search shows the tries it really made

- Each small picture is one try, drawn from that try's own result.
- The try shown as chosen has the lowest cost of those tried.
- A try's seed decides it. The same seed gives the same picture.

## A number is counted from the picture beside it

- Crossings, covered labels and lengths are counted from the layout that is on screen.
- The same graph and settings give the same picture and the same numbers every time.
- A step's picture is that step's result. A node gliding between two steps is the page's animation, not the method.

## The source of each picture is said

- A picture from the page's own step-by-step code says so. A picture from the real ELK or the real TALA says so.
- The two are not mixed in one picture.
