import Anthropic from '@anthropic-ai/sdk'

/**
 * Parse walls from an architectural sketch SVG (browser version).
 *
 * @param {string} svgContent - The SVG file content as a string
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<Object>} Dictionary containing walls data
 */
export async function parseWallsOnly(svgContent, apiKey) {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true // Required for browser usage
  })

  const wallsSchema = {
    type: "json_schema",
    schema: {
      type: "object",
      properties: {
        walls: {
          type: "array",
          items: {
            type: "object",
            properties: {
              wall_id: { type: "string" },
              start_point: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" }
                },
                required: ["x", "y"],
                additionalProperties: false
              },
              end_point: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" }
                },
                required: ["x", "y"],
                additionalProperties: false
              }
            },
            required: ["wall_id", "start_point", "end_point"],
            additionalProperties: false
          }
        }
      },
      required: ["walls"],
      additionalProperties: false
    }
  }

  const prompt = `Extract wall data from this architectural sketch SVG and clean it up.

**SVG DATA:**
\`\`\`svg
${svgContent}
\`\`\`

**CRITICAL: ONLY PROCESS BLUE LINES**
- Extract walls ONLY from lines/paths that are colored BLUE
- Ignore ALL other colors (red, black, green, gray, etc.)
- Check SVG stroke/fill attributes - only process blue elements

**COORDINATE SYSTEM:**
- Origin (0,0) is top-left
- X increases left to right
- Y increases top to bottom

**WALL RATIONALIZATION:**
1. Make all walls perfectly horizontal or vertical (no angles, no curves)
2. If walls touched in the original, they must still touch after cleanup
3. Extend walls as needed so they connect properly
4. Walls that should be on the same line should share the same coordinate

**INSTRUCTIONS:**
1. Find all BLUE lines/paths in the SVG
2. Extract wall start and end points
3. Clean up: make walls horizontal/vertical, ensure they connect, extend as needed
4. Return the walls array
5. Ignore any lines that are not blue.

Return ONLY the walls array in your response.
`

  console.log("Making API call for walls...")
  const response = await client.beta.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 12000,
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
    output_format: wallsSchema
  })

  if (response.content && response.content.length > 0) {
    const outputText = response.content[0].text

    if (response.stop_reason === "max_tokens") {
      console.log("Warning: Response may have been truncated")
    }

    try {
      const parsedData = JSON.parse(outputText)
      console.log(`Successfully parsed walls: ${parsedData.walls?.length || 0} walls found`)
      return parsedData
    } catch (e) {
      console.error(`Error parsing walls JSON: ${e}`)
      throw new Error(`Invalid JSON response: ${e}`)
    }
  } else {
    throw new Error("No content in API response")
  }
}

/**
 * Parse doors from SVG using the Anthropic API.
 *
 * @param {string} svgContent - The SVG file content as a string
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<Array>} Array of door objects with start and end points
 */
export async function parseDoorsOnly(svgContent, apiKey) {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true
  })

  const doorsSchema = {
    type: "json_schema",
    schema: {
      type: "object",
      properties: {
        doors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              door_id: { type: "string" },
              start_point: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" }
                },
                required: ["x", "y"],
                additionalProperties: false
              },
              end_point: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" }
                },
                required: ["x", "y"],
                additionalProperties: false
              }
            },
            required: ["door_id", "start_point", "end_point"],
            additionalProperties: false
          }
        }
      },
      required: ["doors"],
      additionalProperties: false
    }
  }

  const prompt = `Extract door data from this architectural sketch SVG.

**SVG DATA:**
\`\`\`svg
${svgContent}
\`\`\`

**CRITICAL: ONLY PROCESS GREEN LINES**
- Extract doors ONLY from lines/paths that are colored GREEN
- Ignore ALL other colors
- Check SVG stroke/fill attributes - only process green elements

**COORDINATE SYSTEM:**
- Origin (0,0) is top-left
- X increases left to right
- Y increases top to bottom

**INSTRUCTIONS:**
1. Find all GREEN lines/paths in the SVG
2. Extract door start and end points (the two endpoints of each line)
3. Return the doors array

Return ONLY the doors array in your response.
`

  console.log("Making API call for doors...")
  const response = await client.beta.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
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
    output_format: doorsSchema
  })

  if (response.content && response.content.length > 0) {
    const outputText = response.content[0].text

    try {
      const parsedData = JSON.parse(outputText)
      console.log(`Successfully parsed doors: ${parsedData.doors?.length || 0} doors found`)
      return parsedData.doors || []
    } catch (e) {
      console.error(`Error parsing doors JSON: ${e}`)
      throw new Error(`Invalid JSON response: ${e}`)
    }
  } else {
    throw new Error("No content in API response")
  }
}

/**
 * Convert canvas to PNG blob.
 *
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @returns {Promise<Blob>} PNG blob
 */
export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to convert canvas to blob'))
      }
    }, 'image/png')
  })
}

/**
 * Convert blob to base64 string.
 *
 * @param {Blob} blob - Blob to convert
 * @returns {Promise<string>} Base64 string
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Parse room labels from a canvas image using Claude's vision capabilities.
 *
 * @param {HTMLCanvasElement} canvas - Canvas element with the drawing
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<Array>} Array of room objects with names and center points
 */
export async function parseRoomsFromCanvas(canvas, apiKey) {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true
  })

  // Convert canvas to PNG blob then to base64
  const blob = await canvasToPngBlob(canvas)
  const imageBase64 = await blobToBase64(blob)

  const roomsSchema = {
    type: "json_schema",
    schema: {
      type: "object",
      properties: {
        text_labels: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text_content: { type: "string" },
              center_point: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" }
                },
                required: ["x", "y"],
                additionalProperties: false
              }
            },
            required: ["text_content", "center_point"],
            additionalProperties: false
          }
        }
      },
      required: ["text_labels"],
      additionalProperties: false
    }
  }

  const prompt = `Look at this image from an architectural drawing. Extract any text labels (room names) and their center coordinates.

**CRITICAL INSTRUCTIONS:**
1. Extract ONLY the literal text that is actually visible - do NOT make up, interpret, or guess
2. If there is NO text visible, return an empty array: {"text_labels": []}
3. DO NOT make up text that isn't there
4. DO NOT create duplicate entries
5. Only include text you can clearly see and read

**OUTPUT FORMAT:**
For each text you see in the image:
- text_content: the exact text as written (character by character)
- center_point: (x, y) coordinates in IMAGE PIXELS at the center of the text
  - (0,0) is top-left corner of the image
  - X increases left to right
  - Y increases top to bottom

**IF YOU DO NOT SEE ANY TEXT, RETURN: {"text_labels": []}**
`

  console.log("Making API call to extract room labels from image...")
  const response = await client.beta.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    temperature: 0,
    betas: ["structured-outputs-2025-11-13"],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBase64
            }
          },
          {
            type: "text",
            text: prompt
          }
        ]
      }
    ],
    output_format: roomsSchema
  })

  if (response.content && response.content.length > 0) {
    const outputText = response.content[0].text

    try {
      const parsedData = JSON.parse(outputText)
      const textLabels = parsedData.text_labels || []
      console.log(`Found ${textLabels.length} text labels in image`)
      return textLabels
    } catch (e) {
      console.error(`Error parsing rooms JSON: ${e}`)
      throw new Error(`Invalid JSON response: ${e}`)
    }
  } else {
    throw new Error("No content in API response")
  }
}

/**
 * Parse complete architectural sketch using API for everything.
 *
 * @param {string} svgContent - SVG content as string
 * @param {HTMLCanvasElement} canvas - Canvas element for room extraction
 * @param {string} apiKey - Anthropic API key
 * @param {Object} options - Optional settings
 * @param {boolean} options.useGraphData - If true, use provided graph data instead of API parsing
 * @param {Object} options.graphData - Graph data from frontend (walls, doors)
 * @returns {Promise<Object>} Complete architectural data
 */
export async function parseArchitecturalSketch(svgContent, canvas, apiKey, options = {}) {
  console.log("Starting architectural sketch parsing...")

  let walls = []
  let doors = []
  let rooms = []

  // Parse walls - either from API or use provided graph data
  if (options.useGraphData && options.graphData) {
    console.log("Using provided graph data for walls...")
    walls = options.graphData.walls || []
    doors = options.graphData.doors || []
  } else {
    console.log("Parsing walls from SVG using API...")
    try {
      const wallsData = await parseWallsOnly(svgContent, apiKey)
      walls = wallsData.walls || []
    } catch (e) {
      console.error("Error parsing walls:", e)
    }

    console.log("Parsing doors from SVG using API...")
    try {
      doors = await parseDoorsOnly(svgContent, apiKey)
    } catch (e) {
      console.error("Error parsing doors:", e)
    }
  }

  // Extract rooms from canvas image using Claude vision
  console.log("Parsing rooms from canvas using API...")
  if (canvas) {
    try {
      rooms = await parseRoomsFromCanvas(canvas, apiKey)
    } catch (e) {
      console.error("Error extracting rooms:", e)
    }
  }

  const result = {
    walls,
    doors,
    rooms
  }

  console.log("Parsing complete:", result)
  return result
}
