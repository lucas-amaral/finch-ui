/**
 * The text of a file the user picked. Banks export either in UTF-8 or in the old Windows encoding;
 * when reading as UTF-8 leaves broken characters behind, the file is read again the other way.
 */
export async function readFileText(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer()
  const text = new TextDecoder('utf-8').decode(bytes)
  return text.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : text
}
