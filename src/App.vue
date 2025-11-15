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

const send = () => {
  // Export the canvas as SVG
  const svg = paper.project.exportSVG({ asString: true })
  console.log('SVG Output:', svg)

  // Download SVG file
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' })
  const svgUrl = URL.createObjectURL(svgBlob)
  const svgLink = document.createElement('a')
  svgLink.href = svgUrl
  svgLink.download = 'drawing.svg'
  svgLink.click()
  URL.revokeObjectURL(svgUrl)

  // Export and download as PNG
  canvas.value.toBlob((blob) => {
    const pngUrl = URL.createObjectURL(blob)
    const pngLink = document.createElement('a')
    pngLink.href = pngUrl
    pngLink.download = 'drawing.png'
    pngLink.click()
    URL.revokeObjectURL(pngUrl)
  }, 'image/png')
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
