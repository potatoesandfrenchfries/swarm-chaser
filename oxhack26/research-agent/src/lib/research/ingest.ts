import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import mammoth from "mammoth";
import { embed } from "./ai";
import { insertChunks } from "./repository";

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function pdfText(buffer: Buffer) {
  const { default: PDFParser } = await import("pdf2json");
  return new Promise<string>((resolve, reject) => {
    const parser = new PDFParser(null, true);
    parser.on("pdfParser_dataError", (e) =>
      reject(new Error(`PDF parsing error: ${"parserError" in e ? e.parserError : e}`))
    );
    parser.on("pdfParser_dataReady", (data) => {
      const text = data.Pages.flatMap((page) => page.Texts)
        .flatMap((t) => t.R)
        .map((r) => decode(r.T))
        .join(" ");
      resolve(text.trim());
    });
    parser.parseBuffer(buffer);
  });
}

export async function extractText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return pdfText(buffer);
  if (name.endsWith(".docx")) return (await mammoth.extractRawText({ buffer })).value;
  if (name.endsWith(".txt")) return buffer.toString("utf-8");
  throw new Error("Unsupported file type. Upload a PDF, DOCX or TXT file.");
}

/** Extract, chunk, embed and store one file. Returns its document id. */
export async function ingestFile(file: File) {
  const text = (await extractText(file)).trim();
  if (!text) throw new Error("Could not extract any text from the file.");

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 100 });
  const chunks = await splitter.splitText(text);
  const embeddings = await embed(chunks);

  const documentId = crypto.randomUUID();
  const uploadDate = new Date().toISOString();
  await insertChunks(
    chunks.map((content, i) => ({
      content,
      embedding: embeddings[i]!,
      metadata: {
        document_id: documentId,
        file_name: file.name,
        file_size: file.size,
        upload_date: uploadDate,
        chunk_index: i,
        total_chunks: chunks.length,
      },
    }))
  );
  return { documentId, fileName: file.name, chunks: chunks.length };
}
