# Graph layout: realism

This page draws algorithms, not physics. Here realism means that the picture shows the graph that was given and what the method did to it. Each heading is a rule. The lines under it say what the rule forces on screen.

## The picture is the graph

- Every node and every edge in the data is drawn once. Nothing else is drawn as a node or an edge.
- An edge starts on the node it leaves and ends on the node it enters. Its arrowhead is at the node it enters.
- Two edges lie on one line only next to a node they share. Anywhere else, one line reads as an edge that is not in the graph. In the layered method, an edge that leaves a layer where another enters the next layer takes the higher track, or the two ends are moved apart. The router does not run an edge along a line that an edge with a different source and a different target already uses.
- A group's box holds its own members and no others. Two boxes overlap only when one is inside the other. A node with no group is not drawn inside a group's box.
- Nodes do not overlap.
- In the finished picture an edge does not run through a node it does not join. A straight edge crosses a layer upright at its dot, and runs straight only across the gap between two layers, where there is no node.
- Before the edges are routed, an edge is a straight line between the centers of its two nodes. Such a line can pass a node it does not join. That stretch is drawn over the node, so the line is seen to go on and is not read as two edges that end there.
- A node's name is drawn at every size of the picture, and so is the text of an edge label.

## A cause given on screen is the cause

- A cycle is a route along the arrows that comes back to where it began. A graph with none needs no arrow turned.
- An arrow is turned for one of three reasons, and the caption says which, counted from the turned arrows. It is on a cycle of nodes. Or it is on none, but it runs between two boxes that are on a cycle of boxes. Or File order is chosen and it points back in the file.
- The Greedy choice does not turn an arrow that is on no cycle.
- A turned arrow is drawn turned, in red, from Turn to Align, because the layers are built on the turned direction. The finished picture draws it its true way, still in red.

## A layered layout keeps what each step decided

The method works in order: break cycles, give each node a layer, order each layer, place the nodes, route the edges.

- After the first step no cycle is left.
- Every edge runs from a lower layer to a higher one. An edge that spans several layers passes through a place of its own in each layer it crosses.
- The ordering step moves nodes within their layer only. No node changes layer after layers are given.
- Placing nodes keeps the order. Routing keeps the places.
- What the order forces: two edges between the same two layers, with four different ends in opposite order, cross however they are routed. The crossings shown at Route are never fewer than that.
- With no boxes, the crossings at Layers, Sort and Align are the crossings that the order gives, and Align does not change them. Right-angle routing can add crossings of its own.
- A limit on screen holds for what it names. "Most nodes in a layer" holds for each connected piece, and the control says so.

## A search shows the tries it really made

- Each small picture is one try, drawn from that try's own result.
- The try shown as chosen has the lowest cost of those tried.
- A try's seed decides it. The same seed gives the same picture.
- A try starts from a random arrangement, and the caption says so. "Down from" is said only when the kept score is lower than the file order's.
- The caption names every term that the score adds with the current settings.

## A number is counted from the picture beside it

- Crossings, covered labels and lengths are counted from the layout that is on screen.
- Two edges cross once where one passes from one side of the other to the other side. That holds at a bend, at the end of a chord of a curve, and along a run that the two share. Two edges that touch, or that meet at an end, do not cross.
- The same picture gives the same numbers, whatever method or setting made it.
- An edge's length is measured from border to border at every step, and the unit is on screen.
- The score beside a picture is that picture's score. At Route the picture is routed and the score is not, so the number is named as the Search step's.
- A time shown for an engine is the time that engine took for this layout. The download and the engine's start are not in it.
- The same graph and settings give the same picture and the same numbers every time.

## A step's picture is that step's result

- A node gliding between two steps is the page's animation, not the method.
- While nodes glide, the words and numbers stay as they were. They change when the glide ends.
- A line stays on its two nodes while they glide. Where a routed line cannot be carried along, the nodes move with a straight line between them, and the routed line comes in when they are at rest.

## The source of each picture is said

- A picture from the page's own step-by-step code says so. A picture from the real ELK or the real TALA says so.
- The two are not mixed in one picture.
- A control that sets something else in a real engine takes that thing's name there.

## Looks wrong, is right

- The search's Route step shows more crossings than its Search step. Search is drawn with straight lines between nodes. Route draws right-angle routes around the nodes, and those cross more often.
- More tries can leave the picture and the score unchanged. The first try was already the lowest.
- A control can change nothing on a small graph. A graph with no cycle has no arrow to turn, and a graph that is already sorted has nothing to sort.
- Two edges that leave one node, or enter one, can run together next to it. They share that node.
- Two edges that share a run from a shared end do not count as crossing where they part.
- A routed edge can pass through a box that holds neither of its ends. It never passes through a node.
- In the real ELK's picture an edge can loop round and enter a node from the far side. ELK turned that edge and draws it in the true direction.
- Straight and Curved can show the same Edge length. A curve across one gap is only a little longer than the straight line, and the number is rounded to a whole node width.
- An edge that leaves a node and an edge that enters it can share the short piece next to that node. They part within a few units.
- Right-angle bends of two edges can meet corner to corner. The corners are rounded apart, and the two edges do not cross there.
