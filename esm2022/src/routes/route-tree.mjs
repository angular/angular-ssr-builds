/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */
import { stripTrailingSlash } from '../utils/url';
/**
 * A route tree implementation that supports efficient route matching, including support for wildcard routes.
 * This structure is useful for organizing and retrieving routes in a hierarchical manner,
 * enabling complex routing scenarios with nested paths.
 */
export class RouteTree {
    /**
     * The root node of the route tree.
     * All routes are stored and accessed relative to this root node.
     */
    root = this.createEmptyRouteTreeNode('');
    /**
     * A counter that tracks the order of route insertion.
     * This ensures that routes are matched in the order they were defined,
     * with earlier routes taking precedence.
     */
    insertionIndexCounter = 0;
    /**
     * Inserts a new route into the route tree.
     * The route is broken down into segments, and each segment is added to the tree.
     * Parameterized segments (e.g., :id) are normalized to wildcards (*) for matching purposes.
     *
     * @param route - The route path to insert into the tree.
     * @param metadata - Metadata associated with the route, excluding the route path itself.
     */
    insert(route, metadata) {
        let node = this.root;
        const normalizedRoute = stripTrailingSlash(route);
        const segments = normalizedRoute.split('/');
        for (const segment of segments) {
            // Replace parameterized segments (e.g., :id) with a wildcard (*) for matching
            const normalizedSegment = segment[0] === ':' ? '*' : segment;
            let childNode = node.children.get(normalizedSegment);
            if (!childNode) {
                childNode = this.createEmptyRouteTreeNode(normalizedSegment);
                node.children.set(normalizedSegment, childNode);
            }
            node = childNode;
        }
        // At the leaf node, store the full route and its associated metadata
        node.metadata = {
            ...metadata,
            route: normalizedRoute,
        };
        node.insertionIndex = this.insertionIndexCounter++;
    }
    /**
     * Matches a given route against the route tree and returns the best matching route's metadata.
     * The best match is determined by the lowest insertion index, meaning the earliest defined route
     * takes precedence.
     *
     * @param route - The route path to match against the route tree.
     * @returns The metadata of the best matching route or `undefined` if no match is found.
     */
    match(route) {
        const segments = stripTrailingSlash(route).split('/');
        return this.traverseBySegments(segments)?.metadata;
    }
    /**
     * Converts the route tree into a serialized format representation.
     * This method converts the route tree into an array of metadata objects that describe the structure of the tree.
     * The array represents the routes in a nested manner where each entry includes the route and its associated metadata.
     *
     * @returns An array of `RouteTreeNodeMetadata` objects representing the route tree structure.
     *          Each object includes the `route` and associated metadata of a route.
     */
    toObject() {
        return Array.from(this.traverse());
    }
    /**
     * Constructs a `RouteTree` from an object representation.
     * This method is used to recreate a `RouteTree` instance from an array of metadata objects.
     * The array should be in the format produced by `toObject`, allowing for the reconstruction of the route tree
     * with the same routes and metadata.
     *
     * @param value - An array of `RouteTreeNodeMetadata` objects that represent the serialized format of the route tree.
     *                Each object should include a `route` and its associated metadata.
     * @returns A new `RouteTree` instance constructed from the provided metadata objects.
     */
    static fromObject(value) {
        const tree = new RouteTree();
        for (const { route, ...metadata } of value) {
            tree.insert(route, metadata);
        }
        return tree;
    }
    /**
     * A generator function that recursively traverses the route tree and yields the metadata of each node.
     * This allows for easy and efficient iteration over all nodes in the tree.
     *
     * @param node - The current node to start the traversal from. Defaults to the root node of the tree.
     */
    *traverse(node = this.root) {
        if (node.metadata) {
            yield node.metadata;
        }
        for (const childNode of node.children.values()) {
            yield* this.traverse(childNode);
        }
    }
    /**
     * Recursively traverses the route tree from a given node, attempting to match the remaining route segments.
     * If the node is a leaf node (no more segments to match) and contains metadata, the node is yielded.
     *
     * This function prioritizes exact segment matches first, followed by wildcard matches (`*`),
     * and finally deep wildcard matches (`**`) that consume all segments.
     *
     * @param remainingSegments - The remaining segments of the route path to match.
     * @param node - The current node in the route tree to start traversal from.
     *
     * @returns The node that best matches the remaining segments or `undefined` if no match is found.
     */
    traverseBySegments(remainingSegments, node = this.root) {
        const { metadata, children } = node;
        // If there are no remaining segments and the node has metadata, return this node
        if (!remainingSegments?.length) {
            if (metadata) {
                return node;
            }
            return;
        }
        // If the node has no children, end the traversal
        if (!children.size) {
            return;
        }
        const [segment, ...restSegments] = remainingSegments;
        let currentBestMatchNode;
        // 1. Exact segment match
        const exactMatchNode = node.children.get(segment);
        currentBestMatchNode = this.getHigherPriorityNode(currentBestMatchNode, this.traverseBySegments(restSegments, exactMatchNode));
        // 2. Wildcard segment match (`*`)
        const wildcardNode = node.children.get('*');
        currentBestMatchNode = this.getHigherPriorityNode(currentBestMatchNode, this.traverseBySegments(restSegments, wildcardNode));
        // 3. Deep wildcard segment match (`**`)
        const deepWildcardNode = node.children.get('**');
        currentBestMatchNode = this.getHigherPriorityNode(currentBestMatchNode, deepWildcardNode);
        return currentBestMatchNode;
    }
    /**
     * Compares two nodes and returns the node with higher priority based on insertion index.
     * A node with a lower insertion index is prioritized as it was defined earlier.
     *
     * @param currentBestMatchNode - The current best match node.
     * @param candidateNode - The node being evaluated for higher priority based on insertion index.
     * @returns The node with higher priority (i.e., lower insertion index). If one of the nodes is `undefined`, the other node is returned.
     */
    getHigherPriorityNode(currentBestMatchNode, candidateNode) {
        if (!candidateNode) {
            return currentBestMatchNode;
        }
        if (!currentBestMatchNode) {
            return candidateNode;
        }
        return candidateNode.insertionIndex < currentBestMatchNode.insertionIndex
            ? candidateNode
            : currentBestMatchNode;
    }
    /**
     * Creates an empty route tree node with the specified segment.
     * This helper function is used during the tree construction.
     *
     * @param segment - The route segment that this node represents.
     * @returns A new, empty route tree node.
     */
    createEmptyRouteTreeNode(segment) {
        return {
            segment,
            insertionIndex: -1,
            children: new Map(),
        };
    }
}
