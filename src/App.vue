<template>
  <v-app>
    <v-main class="app-container">
      <div class="toolbar">
        <v-btn-group density="compact" variant="outlined">
          <v-btn
            :color="mode === 'draw' ? 'primary' : undefined"
            @click="mode = 'draw'"
          >
            <v-icon>mdi-pencil</v-icon>
          </v-btn>

          <v-menu>
            <template v-slot:activator="{ props }">
              <v-btn
                v-bind="props"
                color="grey"
              >
                <v-icon :color="drawColor">mdi-palette</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="color in colors"
                :key="color.value"
                @click="drawColor = color.value"
              >
                <template v-slot:prepend>
                  <v-icon :color="color.value">mdi-circle</v-icon>
                </template>
                <v-list-item-title>{{ color.name }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>

          <v-btn
            :color="mode === 'erase' ? 'primary' : undefined"
            @click="mode = 'erase'"
          >
            <v-icon>mdi-eraser</v-icon>
          </v-btn>
        </v-btn-group>

        <v-btn class="ml-2" variant="text" @click="send">
          Send
        </v-btn>
      </div>
      <canvas ref="canvas" id="paperCanvas" resize></canvas>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import paper from 'paper'
import Anthropic from '@anthropic-ai/sdk'

const canvas = ref(null)
const mode = ref('draw')
const drawColor = ref('blue')
let path = null

const colors = [
  { name: 'WALLS', value: 'blue' },
  { name: 'DOORS', value: 'green' },
  { name: 'TEXT', value: 'red' },
  { name: 'DIMS', value: '#FF00FF' },
]

onMounted(() => {
  // Setup paper.js with the canvas
  paper.setup(canvas.value)

  // Create a new path for drawing
  const tool = new paper.Tool()

  tool.onMouseDown = (event) => {
    if (mode.value === 'draw') {
      // Create a new path when mouse is pressed in draw mode
      path = new paper.Path()
      path.strokeColor = drawColor.value
      path.strokeWidth = 2
      path.add(event.point)
    } else {
      // Erase mode - check for intersections and delete paths
      const hitResult = paper.project.hitTest(event.point, {
        stroke: true,
        tolerance: 10
      })
      if (hitResult && hitResult.item) {
        hitResult.item.remove()
      }
    }
  }

  tool.onMouseDrag = (event) => {
    if (mode.value === 'draw') {
      // Add points to the path as the mouse is dragged
      if (path) {
        path.add(event.point)
      }
    } else {
      // Erase mode - continuously check for intersections and delete paths
      const hitResult = paper.project.hitTest(event.point, {
        stroke: true,
        tolerance: 10
      })
      if (hitResult && hitResult.item) {
        hitResult.item.remove()
      }
    }
  }

  tool.onMouseUp = () => {
    // Simplify the path when mouse is released (only in draw mode)
    if (mode.value === 'draw' && path) {
      path.simplify(10)
    }
  }
})

// Helper function to check if three points are colinear
const areColinear = (p1, p2, p3, angleTolerance = 10) => {
  // Vectors from p2 to p1 and p2 to p3
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y }
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y }

  // Calculate magnitudes
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y)
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y)

  if (mag1 === 0 || mag2 === 0) return true

  // Calculate dot product
  const dotProduct = v1.x * v2.x + v1.y * v2.y

  // Calculate angle in degrees
  const cosAngle = dotProduct / (mag1 * mag2)
  const angleInDegrees = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI)

  // Check if angle is close to 180 degrees (within tolerance)
  return Math.abs(180 - angleInDegrees) <= angleTolerance
}

// Helper function to remove colinear points from a path
const removeColinearPoints = (points, angleTolerance = 10) => {
  if (points.length <= 2) return points

  const cleaned = [points[0]]

  for (let i = 1; i < points.length - 1; i++) {
    const prev = cleaned[cleaned.length - 1]
    const current = points[i]
    const next = points[i + 1]

    if (!areColinear(prev, current, next, angleTolerance)) {
      cleaned.push(current)
    }
  }

  cleaned.push(points[points.length - 1])
  return cleaned
}

const send = async () => {
  console.log('Processing architectural sketch...')

  // Get API key from environment
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

  if (!apiKey) {
    console.error('API key not found. Please set VITE_ANTHROPIC_API_KEY in your .env file')
    return
  }

  try {
    // Export the canvas as SVG
    const svg = paper.project.exportSVG({ asString: true })
    console.log('SVG exported')

    // Option 1: Use API to parse everything from SVG
    // const architecturalData = await parseArchitecturalSketch(svg, canvas.value, apiKey)

    // Option 2: Use frontend graph for walls/doors, API for rooms
    const wallPaths = paper.project.activeLayer.children.filter(path => path._style.strokeColor._canvasStyle == 'rgb(0,0,255)')
    const doorPaths = paper.project.activeLayer.children.filter(path => path._style.strokeColor._canvasStyle == 'rgb(0,128,0)')
    const dimsPath = paper.project.activeLayer.children.filter(path => path._style.strokeColor._canvasStyle == 'rgb(255,0,255)')

    console.log(paper.project.activeLayer.children)

    // Find bounding box of dimension paths
    const dimsBoundingBox = findBoundingBox(dimsPath)
    let length = Math.max(dimsBoundingBox.height, dimsBoundingBox.width)
    console.log('dims', dimsBoundingBox, length)

    // Extract dimension text/number from paths using Anthropic
    const dimensionData = await extractDimensionNumber(dimsPath, apiKey)
    console.log('Extracted dimension data:', dimensionData)

    // Create graph from wall paths
    let wallGraph = createWallGraph(wallPaths)
    let doorsData = findDoors(doorPaths, wallGraph)

    // Scale to real world dimensions if we have dimension data
    if (dimensionData && dimensionData.dimension_value) {
      const scaled = scaleToRealWorld(
        wallGraph,
        doorsData,
        dimensionData.dimension_value,
        length
      )
      wallGraph = scaled.wallGraph
      doorsData = scaled.doors
      console.log(`All coordinates scaled by factor: ${scaled.scaleFactor}`)
    }

    // Convert wall graph to walls array format
    const walls = wallGraph.edges.map((edge, idx) => {
      const [idx1, idx2] = edge
      const n1 = wallGraph.nodes[idx1]
      const n2 = wallGraph.nodes[idx2]
      return {
        wall_id: `wall_${idx}`,
        start_point: { x: n1.x, y: n1.y },
        end_point: { x: n2.x, y: n2.y }
      }
    })

    let finalJSON = {
      walls: walls,
      doors: doorsData
    }

    console.log('final', finalJSON)

    // Send to server
    try {
      const response = await fetch('http://localhost:8080/api/import-sketch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalJSON)
      })

      const result = await response.json()
      console.log('Server response:', result)

      if (result.Success) {
        console.log('Successfully sent to Revit server')
      } else {
        console.error('Server error:', result.Error)
      }
    } catch (fetchError) {
      console.error('Failed to send to server:', fetchError)
    }

  } catch (error) {
    console.error('Error processing architectural sketch:', error)
  }
}

const extractDimensionNumber = async (dimPaths, apiKey) => {
  if (!dimPaths || dimPaths.length === 0) {
    console.log('No dimension paths to process')
    return null
  }

  // Extract all points from dimension paths
  const pathsData = dimPaths.map(path => {
    if (!path.segments || path.segments.length === 0) return null

    return {
      points: path.segments.map(segment => ({
        x: segment.point.x,
        y: segment.point.y
      }))
    }
  }).filter(p => p !== null)
  console.log('pathsData', pathsData)

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true
  })

  const dimensionSchema = {
    type: "json_schema",
    schema: {
      type: "object",
      properties: {
        dimension_text: { type: "string" },
        dimension_value: { type: "number" }
      },
      required: ["dimension_text"],
      additionalProperties: false
    }
  }

  const prompt = `I have drawn dimension annotation paths (lines forming text/numbers) in an architectural drawing and annotation lines. Here are the path coordinates:

**PATH POINTS:**
${JSON.stringify(pathsData, null, 2)}

**TASK:**
Analyze these path coordinates and determine what text/number they are trying to represent.

**INSTRUCTIONS:**
1. Some of the points form strokes that represent dimension text (e.g., "24", "12.5", "10'", "24'-6\"", etc.) but some of the points are just dimension lines.
2. Analyze the path patterns to determine what characters/numbers are being drawn
3. Return the exact text as dimension_value
4. If you can parse it to a number, also return "dimension_value"

**COORDINATE SYSTEM:**
- Each path is a series of (x, y) points
- Points are connected in order to form strokes
- Multiple paths may form a single character or multiple characters

**EXAMPLES:**
- If paths form "24'", return: {"dimension_text": "24'", "dimension_value": 24}
- If paths form "12'-6\"", return: {"dimension_text": "12'-6\"", "dimension_value": 12.5}
- If paths form "10", return: {"dimension_text": "10", "dimension_value": 10}

Analyze the paths and extract the dimension text.
`

  console.log("Extracting dimension text with Anthropic API...")
  const response = await client.beta.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    temperature: 0,
    betas: ["structured-outputs-2025-11-13"],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          }
        ]
      }
    ],
    output_format: dimensionSchema
  })

  if (response.content && response.content.length > 0) {
    const outputText = response.content[0].text

    try {
      const parsedData = JSON.parse(outputText)
      console.log('Extracted dimension:', parsedData)
      return parsedData
    } catch (e) {
      console.error(`Error parsing dimension JSON: ${e}`)
      return null
    }
  }

  return null
}

const scaleToRealWorld = (wallGraph, doors, dimensionValue, boundingBoxLength) => {
  // Calculate scale factor: real_world_units per pixel
  const scaleFactor = 12 / boundingBoxLength

  console.log(`Scale factor: ${dimensionValue} units / ${boundingBoxLength} pixels = ${scaleFactor} units per pixel`)

  // Scale wall graph nodes
  const scaledWallGraph = {
    nodes: wallGraph.nodes.map(node => ({
      x: node.x * scaleFactor,
      y: node.y * scaleFactor
    })),
    edges: wallGraph.edges // Edges reference node indices, so they don't change
  }

  // Scale door data
  const scaledDoors = doors.map(door => ({
    start: {
      x: door.start.x * scaleFactor,
      y: door.start.y * scaleFactor
    },
    end: {
      x: door.end.x * scaleFactor,
      y: door.end.y * scaleFactor
    },
    original: door.original // Keep original for reference if needed
  }))

  console.log('Scaled wall graph nodes:', scaledWallGraph.nodes)
  console.log('Scaled doors:', scaledDoors)

  return {
    wallGraph: scaledWallGraph,
    doors: scaledDoors,
    scaleFactor
  }
}

const findBoundingBox = (paths) => {
  if (!paths || paths.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  // Iterate through all paths
  paths.forEach((path) => {
    if (!path.segments) return

    // Check all segment points
    path.segments.forEach(segment => {
      const x = segment.point.x
      const y = segment.point.y

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
  })

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  }
}

const createWallGraph = (wallPaths) => {
  const graph = {
    nodes: [],
    edges: []
  }
  const mergeDistance = 40 // pixels

  // Helper function to calculate distance between two points
  const distance = (p1, p2) => {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)
  }

  // Process each path
  wallPaths.forEach((path) => {
    if (!path.segments) return
    console.log('path', path)
    // Extract points from path segments
    const points = path.segments.map(segment => ({
      x: segment.point.x,
      y: segment.point.y
    }))

    // Remove colinear points
    const cleanedPoints = removeColinearPoints(points)

    // Add nodes and edges to graph
    for (let i = 0; i < cleanedPoints.length - 1; i++) {
      const p1 = cleanedPoints[i]
      const p2 = cleanedPoints[i + 1]

      // Find or add node indices (merge nodes within mergeDistance)
      let idx1 = graph.nodes.findIndex(n => distance(n, p1) < mergeDistance)
      if (idx1 === -1) {
        idx1 = graph.nodes.length
        graph.nodes.push(p1)
      }

      let idx2 = graph.nodes.findIndex(n => distance(n, p2) < mergeDistance)
      if (idx2 === -1) {
        idx2 = graph.nodes.length
        graph.nodes.push(p2)
      }

      // Add edge (avoid self-loops)
      if (idx1 !== idx2) {
        graph.edges.push([idx1, idx2])
      }
    }
  })

  // Snap edges to horizontal/vertical if within 10 degrees
  const snapTolerance = 10 // degrees
  graph.edges.forEach(([idx1, idx2]) => {
    const n1 = graph.nodes[idx1]
    const n2 = graph.nodes[idx2]

    // Calculate angle of the edge
    const dx = n2.x - n1.x
    const dy = n2.y - n1.y
    const angleRad = Math.atan2(dy, dx)
    const angleDeg = angleRad * (180 / Math.PI)

    // Normalize angle to 0-360
    const normalizedAngle = ((angleDeg % 360) + 360) % 360

    // Check if close to horizontal (0° or 180°)
    const isNearHorizontal =
      normalizedAngle <= snapTolerance ||
      normalizedAngle >= (360 - snapTolerance) ||
      Math.abs(normalizedAngle - 180) <= snapTolerance

    // Check if close to vertical (90° or 270°)
    const isNearVertical =
      Math.abs(normalizedAngle - 90) <= snapTolerance ||
      Math.abs(normalizedAngle - 270) <= snapTolerance

    if (isNearHorizontal) {
      // Make perfectly horizontal - average the y coordinates
      const avgY = (n1.y + n2.y) / 2
      n1.y = avgY
      n2.y = avgY
    } else if (isNearVertical) {
      // Make perfectly vertical - average the x coordinates
      const avgX = (n1.x + n2.x) / 2
      n1.x = avgX
      n2.x = avgX
    }
  })

  // Remove duplicate edges (edges connecting the same nodes)
  const uniqueEdges = new Map()
  graph.edges.forEach(([idx1, idx2]) => {
    // Create a key that's the same regardless of edge direction
    const key = [Math.min(idx1, idx2), Math.max(idx1, idx2)].join('-')
    uniqueEdges.set(key, [idx1, idx2])
  })
  graph.edges = Array.from(uniqueEdges.values())

  console.log('Graph:', graph)
  console.log('Nodes:', graph.nodes.length)
  console.log('Edges:', graph.edges.length)

  return graph
}

const findDoors = (doorPaths, graph) => {
  const doors = []

  // Helper function to calculate distance between point and line segment
  const distanceToSegment = (point, lineStart, lineEnd) => {
    const dx = lineEnd.x - lineStart.x
    const dy = lineEnd.y - lineStart.y
    const lengthSquared = dx * dx + dy * dy

    if (lengthSquared === 0) {
      // Line segment is a point
      const distX = point.x - lineStart.x
      const distY = point.y - lineStart.y
      return Math.sqrt(distX * distX + distY * distY)
    }

    // Calculate projection of point onto line segment
    let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared
    t = Math.max(0, Math.min(1, t))

    const projectedX = lineStart.x + t * dx
    const projectedY = lineStart.y + t * dy

    const distX = point.x - projectedX
    const distY = point.y - projectedY
    return {
      distance: Math.sqrt(distX * distX + distY * distY),
      projected: { x: projectedX, y: projectedY }
    }
  }

  // Helper function to snap point to nearest edge
  const snapToNearestEdge = (point) => {
    let minDistance = Infinity
    let snappedPoint = point

    graph.edges.forEach(([idx1, idx2]) => {
      const n1 = graph.nodes[idx1]
      const n2 = graph.nodes[idx2]
      const result = distanceToSegment(point, n1, n2)

      if (result.distance < minDistance) {
        minDistance = result.distance
        snappedPoint = result.projected
      }
    })

    return snappedPoint
  }

  // Process each door path
  doorPaths.forEach((path) => {
    if (!path.segments || path.segments.length < 2) return

    const segments = path.segments
    const startPoint = {
      x: segments[0].point.x,
      y: segments[0].point.y
    }
    const endPoint = {
      x: segments[segments.length - 1].point.x,
      y: segments[segments.length - 1].point.y
    }

    // Snap both endpoints to nearest wall edges
    const snappedStart = snapToNearestEdge(startPoint)
    const snappedEnd = snapToNearestEdge(endPoint)

    doors.push({
      start: snappedStart,
      end: snappedEnd,
      original: {
        start: startPoint,
        end: endPoint
      }
    })
  })

  console.log('Doors:', doors)
  return doors
}

onBeforeUnmount(() => {
  // Clean up paper.js
  if (paper.project) {
    paper.project.clear()
  }
})
</script>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  padding: 0;
  overflow: hidden;
  position: relative;
}

.toolbar {
  position: absolute;
  top: 15px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
}

#paperCanvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
  background-color: white;
}
</style>
