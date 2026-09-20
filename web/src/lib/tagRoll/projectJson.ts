/**
 * SingTags Tag Studio project JSON (schema {@link TAG_ROLL_SCHEMA}).
 * Same shape as checked-in starter templates under `defaultProjects/`.
 */
import { newTagRollProjectId } from './ids'
import { normalizeTagRollProject } from './normalize'
import { TAG_ROLL_SCHEMA, type TagRollProject } from './types'

/** Safe download stem from a project title. */
export function tagRollJsonFilename(project: Pick<TagRollProject, 'title'>): string {
  const stem = project.title.replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
  return `${stem || 'tag-studio'}.json`
}

/**
 * Serialize a project for file export.
 * Drops library linkage; keeps musical content + view prefs.
 */
export function serializeTagRollProjectJson(project: TagRollProject): TagRollProject {
  const normalized = normalizeTagRollProject({
    ...project,
    localEntryId: null,
  })
  if (!normalized) {
    throw new Error('Project could not be serialized')
  }
  return normalized
}

export type ParseTagRollJsonResult =
  | { ok: true; project: TagRollProject }
  | { ok: false; error: string }

/**
 * Parse a SingTags Tag Studio JSON document.
 * Always assigns a fresh project id so imports never collide with existing ones.
 */
export function parseTagRollProjectJson(
  raw: unknown,
  opts?: { now?: number },
): ParseTagRollJsonResult {
  const now = opts?.now ?? Date.now()
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'File is not a JSON object' }
  }
  const o = raw as Record<string, unknown>
  if (o.schema != null && o.schema !== TAG_ROLL_SCHEMA) {
    return {
      ok: false,
      error: `Unsupported schema (expected ${TAG_ROLL_SCHEMA})`,
    }
  }
  const normalized = normalizeTagRollProject({
    ...o,
    id: newTagRollProjectId(),
    localEntryId: null,
    createdAt: now,
    updatedAt: now,
  })
  if (!normalized) {
    return { ok: false, error: 'Invalid Tag Studio project JSON' }
  }
  if (!normalized.notes.length && !normalized.parts.length) {
    return { ok: false, error: 'Project has no parts' }
  }
  return { ok: true, project: normalized }
}

/** Parse JSON text from an imported file. */
export function parseTagRollProjectJsonText(
  text: string,
  opts?: { now?: number },
): ParseTagRollJsonResult {
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    return { ok: false, error: 'File is not valid JSON' }
  }
  return parseTagRollProjectJson(raw, opts)
}

/** Trigger a browser download of the project as SingTags JSON. */
export function downloadTagRollProjectJson(project: TagRollProject): void {
  const body = serializeTagRollProjectJson(project)
  const blob = new Blob([`${JSON.stringify(body, null, 2)}\n`], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = tagRollJsonFilename(project)
  a.click()
  URL.revokeObjectURL(url)
}

/** Read a File / Blob as Tag Studio JSON. */
export async function readTagRollProjectJsonFile(
  file: Blob,
  opts?: { now?: number },
): Promise<ParseTagRollJsonResult> {
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: 'Could not read file' }
  }
  return parseTagRollProjectJsonText(text, opts)
}
