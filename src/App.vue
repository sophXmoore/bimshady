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

const canvas = ref(null)
const mode = ref('draw')
const drawColor = ref('black')
let path = null

const colors = [
  { name: 'Black', value: 'black' },
  { name: 'Red', value: 'red' },
  { name: 'Blue', value: 'blue' },
  { name: 'Green', value: 'green' },
  { name: 'Yellow', value: 'yellow' },
  { name: 'Orange', value: 'orange' },
  { name: 'Purple', value: 'purple' },
  { name: 'Magenta', value: '#FF00FF' },
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

const send = () => {
  const paths = paper.project.activeLayer.children
  const graph = {
    nodes: [],
    edges: []
  }
  const mergeDistance = 25 // pixels

  // Helper function to calculate distance between two points
  const distance = (p1, p2) => {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)
  }

  // Process each path
  paths.forEach((path) => {
    if (!path.segments) return

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

  console.log('Graph:', graph)
  console.log('Nodes:', graph.nodes.length)
  console.log('Edges:', graph.edges.length)

  // Export the canvas as SVG
  // const svg = paper.project.exportSVG({ asString: true })
  // console.log('SVG Output:', svg)

  // // Download SVG file
  // const svgBlob = new Blob([svg], { type: 'image/svg+xml' })
  // const svgUrl = URL.createObjectURL(svgBlob)
  // const svgLink = document.createElement('a')
  // svgLink.href = svgUrl
  // svgLink.download = 'drawing.svg'
  // svgLink.click()
  // URL.revokeObjectURL(svgUrl)

  // // Export and download as PNG
  // canvas.value.toBlob((blob) => {
  //   const pngUrl = URL.createObjectURL(blob)
  //   const pngLink = document.createElement('a')
  //   pngLink.href = pngUrl
  //   pngLink.download = 'drawing.png'
  //   pngLink.click()
  //   URL.revokeObjectURL(pngUrl)
  // }, 'image/png')

  // // Download graph as JSON
  // const graphJson = JSON.stringify(graph, null, 2)
  // const graphBlob = new Blob([graphJson], { type: 'application/json' })
  // const graphUrl = URL.createObjectURL(graphBlob)
  // const graphLink = document.createElement('a')
  // graphLink.href = graphUrl
  // graphLink.download = 'graph.json'
  // graphLink.click()
  // URL.revokeObjectURL(graphUrl)
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
