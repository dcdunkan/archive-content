# Balanced Binary Search Trees - AVL Tree

AVL Tree is invented by GM Adelson - Velsky and EM Landis in 1962. The tree is
named AVL in honour of its inventors. An AVL tree is a self-balancing binary
search tree that maintains a balanced structure through rotations to ensure
efficient search, insertion, and deletion operations. OR Tree can be defined as
height balanced binary search tree in which each node is associated with a
balance factor.

## Balance Factor

Balance Factor of a node $=$ height of left subtree – height of right subtree.
In an AVL tree balance factor of every node is -1,0 or $+ 1$. Otherwise the tree
will be unbalanced and need to be balanced. Characteristic of an AVL tree is
that for every node, the difference in height between its left and right
subtrees is at most one.

![Tree is Balanced](images/077661663bc260360ec426f69d3e54efa56e96c33b0ffc98aa85a287c133c293.jpg "Tree is Balanced")

![Tree is not Balanced. Balance factor of C is 2](images/077661663bc260360ec426f69d3e54efa56e96c33b0ffc98aa85a287c133c293a.jpg "Tree is not Balanced. Balance factor of C is 2")

![Tree is not Balanced. Balance factor of A is -2](images/077661663bc260360ec426f69d3e54efa56e96c33b0ffc98aa85a287c133c293b.jpg "Tree is not Balanced. Balance factor of A is -2")

## Why AVL Tree?

- Most of the Binary Search Tree (BST) operations (eg: search, insertion,
  deletion etc) take O(h) time where h is the height of the BST.
- The minimum height of the BST is log n
- The height of an AVL tree is always O(log n) where n is the number of nodes in
  the tree. So the time complexity of all AVL tree operations are O(log n)
- An AVL tree becomes imbalanced due to some insertion or deletion operations.
- We use rotation operation to make the tree balanced.

## 4 Types of Rotations

![Types of AVL Tree rotations](images/190d4eedd6b8b9a131a361309bccd0b806166148681fc3056d51e0d1ef3ec290.jpg "Types of AVL Tree rotations")

### LL Rotation

- Single **right** rotation
- This rotation is performed when a new node is inserted to the left child of
  left subtree

![LL Rotation](images/6169e7e69d43a869deb11faca2d3ccc0db7334b23ba61b38ec6fcff042638461.jpg "LL Rotation")

### RR Rotation

- Single **left** rotation
- This rotation is performed when a new node is inserted to the left child of
  left subtree

![RR Rotation Step 0](images/608df50a45d0dee39319f5d59b901000c272f8f671d94864c06775b7d0a38d08.jpg "RR Rotation Step 0")

### Left-Right Rotation (LR Rotation)

![RR Rotation Step 1](images/589e8469ef7a6e83a3499eb4357d58a59667bc9ac965970831abddb5d7d39aed.jpg "RR Rotation Step 1")

![RR Rotation Step 2](images/21cb16b5f59383eac1133bd0bfc6af4e367107693f8e16c054891f3fdcba6d1d.jpg "RR Rotation Step 2")

The LR rotation is the combination of single left rotation followed by single
right rotation.

### Left-Right Rotation (LR Rotation)

- Double rotation
- The LR rotation is the combination of single left rotation followed by single
  right rotation.
- i.e; Perform a left rotation on the left child, followed by a right rotation
  on the node.

![LR Rotation Step 0](images/a6002be5f25791cac05418eddd86b3b3039ae7227d5ee94cd03d1c04a39be637.jpg "LR Rotation Step 0")

![LR Rotation Step 1](images/e24fa0c440a74fbceb1f4243029ff671ba2824fd9e0b99b4ca7afbcc78623538.jpg "LR Rotation Step 1")

![LR Rotation Step 2](images/1046828c116908c6ec8ba64a6d45d58afdda125002a452d7ee3c51807c9d11ad.jpg "LR Rotation Step 2")

![LR Rotation Step 3](images/eee79c2887ceb5e4594931272de7084edfde555f71b1bfc52362590df24dd545.jpg "LR Rotation Step 3")

![LR Rotation Step 4](images/32af7807c90643d867e8cb3adb7f981cd967dcce89b933d9d7439aaf0d1682e2.jpg "LR Rotation Step 4")

### Right-Left Rotation(RL Rotation)

- Double rotation
- The RL rotation is the combination of single right rotation followed by single
  left rotation.
- i.e; Perform a right rotation on the right child, followed by a left rotation
  on the node.

![RL Rotation Step 0](images/bea6f11fe8f7f571f69e605b431802152a1ea6b3f4ffb9b8f92951930ced7076.jpg "RL Rotation Step 0")

![RL Rotation Step 1](images/bea6f11fe8f7f571f69e605b431802152a1ea6b3f4ffb9b8f92951930ced7076a.jpg "RL Rotation Step 1")

![RL Rotation Step 2](images/bea6f11fe8f7f571f69e605b431802152a1ea6b3f4ffb9b8f92951930ced7076b.jpg "RL Rotation Step 2")

![RL Rotation Step 3](images/bea6f11fe8f7f571f69e605b431802152a1ea6b3f4ffb9b8f92951930ced7076c.jpg "RL Rotation Step 3")

![RL Rotation Step 4](images/3d01fdc5d8a090294b339e98cc216a19e039260d1a97d248dd1af13575358096.jpg "RL Rotation Step 4")

## AVL Tree Insertion Algorithm

1. Insert the node as the leaf node. Use BST insertion procedure
2. After insertion check the balance factor of every node
3. If the tree is imbalanced, perform the suitable rotation. Let z be the newly
   inserted node. X be the first unbalanced node on the path from z to root. y
   be the child of x on the path from z to root
   - If y is the left child of x and $\mathbf { Z }$ is in the left subtree of
     y, then perform RR Rotation with respect to x.
   - If y is the right child of x and $\mathbf { Z }$ is in the right subtree of
     y, then perform LL Rotation with respect to x
   - If y is the left child of x and $\mathbf { Z }$ is in the right subtree of
     y, then perform LR Rotation
   - If y is the right child of x and $\mathbf { Z }$ is in the left subtree of
     y, then perform RL Rotation

Complexity of AVL tree insertion
$= { \mathrm { O } } ( \log { \mathfrak { n } } )$

Where log n is the height of the tree.

Example:

Insert 14,17,11,7,53,4 and 13 in to an empty AVL tree

![Insert 14](images/5b2e7b3df010f7c0a10e60ded6d57da95c347d97a09bbf1af6d312b3dd08e78c.jpg "Insert 14")

![Insert 17](images/5b2e7b3df010f7c0a10e60ded6d57da95c347d97a09bbf1af6d312b3dd08e78ca.jpg "Insert 17")

![Insert 11](images/5b2e7b3df010f7c0a10e60ded6d57da95c347d97a09bbf1af6d312b3dd08e78cb.jpg "Insert 11")

![Insert 7](images/5b2e7b3df010f7c0a10e60ded6d57da95c347d97a09bbf1af6d312b3dd08e78cc.jpg "Insert 7")

![Insert 53](images/5b2e7b3df010f7c0a10e60ded6d57da95c347d97a09bbf1af6d312b3dd08e78cd.jpg "Insert 53")

![Insert 4](images/5b2e7b3df010f7c0a10e60ded6d57da95c347d97a09bbf1af6d312b3dd08e78ce.jpg "Insert 4")

The tree is now imbalanced because the balance factor of node 11 is 2. Perform
RR Rotation with respect to 11

![RR Rotation 11](images/9ee9ba0e989bfe154d42e914bb34093d6a79bb78a903bacd588c88ca9def24fd.jpg "RR Rotation 11")

![Insert 13](images/9ee9ba0e989bfe154d42e914bb34093d6a79bb78a903bacd588c88ca9def24fda.jpg "Insert 13")

## AVL Tree Deletion Algorithm

Let w be the node to be deleted

1. Delete w using BST deletion procedure
2. Starting from w, travel up and find the first unbalanced node. Let x be the
   first unbalanced node.
3. If balance factor $( \mathbf { \boldsymbol { x } } ) { > } 1$ then
   y=leftchild(x)
4. Else y=rightchild(x)
5. If y is the left child of x
   1. If balance factor $( \mathrm { y } ) { \ge } 0$ then $z { = }$
      leftchild(y)
   2. Else $z { = }$ rightchild(y)
6. Else
   1. If balance factor $( \mathrm { y } ) \leq 0$ then $z { = }$ rightchild(y)
   2. Else $z { = }$ leftchild(y)
7. If y is the left child of x and $\mathbf { Z }$ is the left child of y, then
   perform RR Rotation with respect to x
8. If y is the right child of x and $\mathbf { Z }$ is the right child of y,
   then perform LL Rotation with respect to x
9. If y is the left child of x and $\mathbf { Z }$ is the right child of y, then
   perform LR Rotation with respect to x
10. If y is the right child of x and $\mathbf { Z }$ is the left child of y,
    then perform RL Rotation with respect to x

Complexity of AVL tree deletion $= \mathrm { O } ( \log { \mathfrak { n } } )$

Where log n is the height of the tree.

Example:

Delete 20 from the given AVL Tree

![Delete 20 from the given AVL Tree](images/343c52613feac0f8d3a5334ef1cc16d34682e9e41e2b84b670f22802d7720723.jpg "Delete 20 from the given AVL Tree")
