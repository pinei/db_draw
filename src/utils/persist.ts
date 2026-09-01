import type { DiagramState } from '../model/types'
import { generateDbml, generateMermaid } from './codePlaceholder'
import { Compiler, MemoryProjectLayout, Filepath } from '@dbml/parse'

const BASE = '/api/models'

export function validateDbml(text: string): { success: boolean; message: string } {
  try {
    const project = new MemoryProjectLayout()
    const filepath = Filepath.from('schema.dbml')
    project.setSource(filepath, text)
    
    const compiler = new Compiler(project)
    const result = compiler.interpretFile(filepath)
    
    const errors = result.getErrors()
    if (errors.length > 0) {
      const errorMessages = errors
        .map(e => `${e.message} (${e.line}:${e.column})`)
        .join('; ')
      return { success: false, message: `✗ Erro: ${errorMessages}` }
    }
    
    return { success: true, message: '✓ DBML válido — pronto para aplicar' }
  } catch (err: any) {
    return { success: false, message: `✗ Erro: ${err.message}` }
  }
}

export async function loadModel(name: string): Promise<DiagramState | null> {
  const res = await fetch(`${BASE}/${name}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to load model "${name}": ${res.status}`)
  const data = await res.json()
  // Strip derived export fields that are not part of DiagramState
  delete data._dbml
  delete data._mermaid
  return data as DiagramState
}

export async function saveModel(name: string, state: DiagramState): Promise<void> {
  // Attach derived exports as side-channel fields so the server can write them
  const payload = {
    ...state,
    _dbml:    generateDbml(state.schema),
    _mermaid: generateMermaid(state.schema),
  }
  const res = await fetch(`${BASE}/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok && res.status !== 204) throw new Error(`Failed to save model "${name}": ${res.status}`)
}
