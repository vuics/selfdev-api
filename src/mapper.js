import safeRegex from "safe-regex";

// TODO: move the parseRegexString to this file or separate from ui
import { parseRegexString,
  // useWindowDimensions, sleep, hexToRgba
} from '../helper.js'

export const variableRegex = /(\[\[[A-Za-z0-9_-]+\]\])/g;
export const unameRegex = /\[\[([A-Za-z0-9_-]+)\]\]/;
export const commentRegex = /(\[\/\*\[[A-Za-z0-9_-]+\]\*\/\])/g;
export const ucommentRegex = /\[\/\*\[([A-Za-z0-9_-]+)\]\*\/\]/;
export const variableOrCommentRegex = /(\[\[[A-Za-z0-9_-]+\]\])|(\[\/\*\[[A-Za-z0-9_-]+\]\*\/\])/g;

export function buildSmartText({ text, getNodes }) {
  const allNodes = getNodes()
  let parts = ''
  let smartText = ''
  const startTime = Date.now()
  do {
    if (Date.now() - startTime > 5000) {
      console.warn('buildSmartText> Loop timed out after 5 seconds.');
      break;
    }
    parts = text.split(variableOrCommentRegex)
    smartText = parts.map((part) => {
      if (variableRegex.test(part)) {
        let uname = part
        const match = part.match(unameRegex);
        // console.log('match:', match)
        if (match) {
          uname = match[1]
        }
        let foundNodes = allNodes.filter((n) => n.data.uname === uname);
        let nodeText
        if (foundNodes.length === 1) {
          nodeText = foundNodes[0].data.text
        } else {
          console.warn('buildSmartText> foundNodes for part:', part, 'do not consist of exactly one node, foundNodes:', foundNodes)
          nodeText = ''
        }
        return nodeText
      } if (commentRegex.test(part)) {
        return ''
      } else {
        return part
      }
    } ).join('\n');
    text = smartText
  } while (parts.length > 1)
  return smartText
}

export function checkCondition({ condition, text }) {
  let satisfied = true
  let safe = true
  if (condition) {
    const { pattern, flags } = parseRegexString(condition);
    console.log('pattern:', pattern, ', flags:', flags)
    safe = safeRegex(pattern)
    if (safe) {
      const safeRegex = new RegExp(pattern, flags);
      satisfied = safeRegex.test(text)
    }
  }
  console.log('condition:', condition, ', satisfied:', satisfied, ', safe:', safe)
  return [ satisfied, safe ]
}

export async function playEdge ({
  sourceNodeData, edgeData,
  getNodes, setNodes, getEdges, setEdges,
  credentials, sendPersonalMessage, sendAttachments,
  edgeId, targetId,
}) {
  const { text, attachments } = sourceNodeData
  const { recipient, condition } = edgeData
  const smartText = buildSmartText({ text, getNodes })
  // console.log('smartText:', smartText)
  const [ satisfied, safe ] = checkCondition({ condition, text: smartText })
  // console.log('condition:', condition, ', satisfied:', satisfied, ', safe:', safe)

  setNodes((nodes) =>
    nodes.map((node) =>
      node.id === targetId ? {
        ...node,
        data: {
          ...node.data,
          waitRecipient: (smartText && satisfied) ? recipient : undefined,
          text: recipient ? '' : node.data.text,
        }
      } : node
    )
  )
  setEdges((edges) =>
    edges.map((edge) =>
      edge.id === edgeId ? { ...edge, data: { ...edge.data, satisfied, safe, cursor: true } } : edge
    )
  )

  if (recipient) {
    if (attachments && attachments.length > 0) {
      await sendAttachments({ credentials, recipient, attachments })
    }
    await sendPersonalMessage({ credentials, recipient, prompt: smartText });
  } else {
    const edges = getEdges()
    const edge = edges.find(edge => edge.id === edgeId)
    const nodes = getNodes()
    const sourceNode = nodes.find(node => node.id === edge.source)
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === edge.target) {
          // console.log('+ smartText:', smartText, ', satisfied:', satisfied)
          if ((smartText || sourceNode.data.attachments?.length > 0) && satisfied) {
            const attachments = [...new Set([...(node.data.attachments || []), ...(sourceNode.data.attachments || []) ])]
            // console.log('edge attachments:', attachments)
            if (!node.data.text.includes(`[[${sourceNode.data.uname}]]`) &&
                !node.data.text.includes(`[/*[${sourceNode.data.uname}]*/]`)) {
              return { ...node, data: { ...node.data, text: node.data.text + `[[${sourceNode.data.uname}]]`, attachments } }
            } else if (node.data.text.includes(`[/*[${sourceNode.data.uname}]*/]`)) {
              return { ...node, data: { ...node.data, text: node.data.text.replace(`[/*[${sourceNode.data.uname}]*/]`, `[[${sourceNode.data.uname}]]`), attachments } }
            }
            return { ...node, data: { ...node.data, attachments } }
          } else {
            // unlinkEdge({ edge, getNodes, setNodes })
            return { ...node, data: { ...node.data, text: node.data.text.replace(`[[${sourceNode.data.uname}]]`, `[/*[${sourceNode.data.uname}]*/]`), attachments: node.data.attachments?.filter(item => !sourceNode.data.attachments.includes(item)) } }
          }
        }
        return node
      })
    );
  }
}

export function unlinkEdge({ edge, getNodes, setNodes }) {
  const nodes = getNodes()
  const sourceNode = nodes.find(node => node.id === edge.source)
  setNodes((nodes) =>
    nodes.map((node) =>
      node.id === edge.target ? { ...node, data: { ...node.data,
        text: node.data.text.replace(`[[${sourceNode.data.uname}]]`, '').replace(`[/*[${sourceNode.data.uname}]*/]`, '') }
      } : node
    )
  )
}

// ui
export function startEditing({ id, data, setNodes }) {
  console.log('startEditing')
  if (!data.editing) {
    console.log('startEditing: update nodes')
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, editing: !data.editing } } : node
    ))
  }
}

// ui
export function switchEditing({ id, data, setNodes }) {
  console.log('switchEditing')
  setNodes((nodes) =>
    nodes.map((node) =>
      node.id === id ? { ...node, data: { ...node.data, editing: !data.editing } } : node
    )
  );
}


