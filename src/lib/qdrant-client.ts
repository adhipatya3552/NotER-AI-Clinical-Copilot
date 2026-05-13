// Qdrant vector database client for patient consultation memory

import { QdrantClient } from "@qdrant/js-client-rest";
import { encrypt, decrypt, safeDecrypt } from "./encryption";

const COLLECTION_NAME = "consultations";
const VECTOR_SIZE = 384; // matches the embedding size we'll use

let client: QdrantClient | null = null;
// Cache the collection-ready state — avoids a Qdrant network round-trip
// on every memory read/write after the first successful ensure.
let collectionReady = false;

export function getQdrantClient(): QdrantClient | null {
  if (client) return client;

  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;

  if (!url) {
    console.warn("Qdrant URL not configured");
    return null;
  }

  client = new QdrantClient({
    url,
    apiKey: apiKey || undefined,
  });

  return client;
}

export async function ensureCollection(): Promise<boolean> {
  // Short-circuit: skip the Qdrant round-trip if we already know it's ready.
  if (collectionReady) return true;

  const qdrant = getQdrantClient();
  if (!qdrant) return false;

  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === COLLECTION_NAME
    );

    if (!exists) {
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_SIZE,
          distance: "Cosine",
        },
      });
      console.log(`Created collection: ${COLLECTION_NAME}`);
    }

    collectionReady = true;
    return true;
  } catch (error) {
    console.error("Failed to ensure Qdrant collection:", error);
    return false;
  }
}

export interface ConsultationRecord {
  id: string;
  patientName: string;
  date: string;
  summary: string;
  keywords: string[];
  transcript: string;
  soapNotes: string;       // JSON string of SOAPNotes
  prescriptions: string;   // JSON string of PrescriptionItem[]
}

// Simple text-to-vector using character frequency (for demo purposes)
// In production, use Gemini embeddings or a dedicated embedding model
export function textToVector(text: string): number[] {
  const vector = new Array(VECTOR_SIZE).fill(0);
  const normalized = text.toLowerCase();

  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);
    const index = charCode % VECTOR_SIZE;
    vector[index] += 1;
  }

  // Normalize the vector
  const magnitude = Math.sqrt(
    vector.reduce((sum: number, val: number) => sum + val * val, 0)
  );
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }

  return vector;
}

export async function storeConsultation(
  record: ConsultationRecord
): Promise<boolean> {
  const qdrant = getQdrantClient();
  if (!qdrant) return false;

  try {
    await ensureCollection();

    // Generate vector from PLAINTEXT (search must work on real content)
    const vector = textToVector(
      `${record.summary} ${record.keywords.join(" ")} ${record.transcript}`
    );

    // Encrypt sensitive fields before storing in Qdrant
    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: [
        {
          id: record.id,
          vector,
          payload: {
            patientName:   encrypt(record.patientName),
            date:          record.date,  // keep date unencrypted for sorting
            summary:       encrypt(record.summary),
            keywords:      encrypt(JSON.stringify(record.keywords)),
            soapNotes:     encrypt(record.soapNotes),
            prescriptions: encrypt(record.prescriptions),
            transcript:    encrypt(record.transcript),
            _encrypted:    true,  // flag for migration compatibility
          },
        },
      ],
    });

    return true;
  } catch (error) {
    console.error("Failed to store consultation:", error);
    return false;
  }
}

export interface SearchResult {
  id: string;
  patientName: string;
  date: string;
  summary: string;
  keywords: string[];
  soapNotes: string;
  prescriptions: string;
  score?: number;
}

export async function searchPatientHistory(
  queryText: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const qdrant = getQdrantClient();
  if (!qdrant) return [];

  try {
    await ensureCollection();

    const vector = textToVector(queryText);

    const results = await qdrant.search(COLLECTION_NAME, {
      vector,
      limit,
      with_payload: true,
    });

    return results.map((r) => {
      const isEncrypted = r.payload?._encrypted === true;
      return {
        id: String(r.id),
        patientName: isEncrypted
          ? (safeDecrypt(r.payload?.patientName as string) ?? "Unknown")
          : (r.payload?.patientName as string) || "Unknown",
        date: (r.payload?.date as string) || "",
        summary: isEncrypted
          ? (safeDecrypt(r.payload?.summary as string) ?? "")
          : (r.payload?.summary as string) || "",
        keywords: isEncrypted
          ? JSON.parse(safeDecrypt(r.payload?.keywords as string) ?? "[]")
          : (r.payload?.keywords as string[]) || [],
        soapNotes: isEncrypted
          ? (safeDecrypt(r.payload?.soapNotes as string) ?? "{}")
          : (r.payload?.soapNotes as string) || "{}",
        prescriptions: isEncrypted
          ? (safeDecrypt(r.payload?.prescriptions as string) ?? "[]")
          : (r.payload?.prescriptions as string) || "[]",
        score: r.score,
      };
    });
  } catch (error) {
    console.error("Failed to search patient history:", error);
    return [];
  }
}

// Fetch all consultations using Qdrant scroll API (no vector needed)
export async function getAllConsultations(
  limit: number = 50,
  offset?: string | number | null
): Promise<{ records: SearchResult[]; nextOffset: string | number | null }> {
  const qdrant = getQdrantClient();
  if (!qdrant) return { records: [], nextOffset: null };

  try {
    await ensureCollection();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrollArgs: any = { limit, with_payload: true };
    if (offset != null) scrollArgs.offset = offset;

    const result = await qdrant.scroll(COLLECTION_NAME, scrollArgs);

    const records: SearchResult[] = (result.points || []).map((p) => {
      const isEncrypted = p.payload?._encrypted === true;
      return {
        id: String(p.id),
        patientName: isEncrypted
          ? (safeDecrypt(p.payload?.patientName as string) ?? "Unknown")
          : (p.payload?.patientName as string) || "Unknown",
        date: (p.payload?.date as string) || "",
        summary: isEncrypted
          ? (safeDecrypt(p.payload?.summary as string) ?? "")
          : (p.payload?.summary as string) || "",
        keywords: isEncrypted
          ? JSON.parse(safeDecrypt(p.payload?.keywords as string) ?? "[]")
          : (p.payload?.keywords as string[]) || [],
        soapNotes: isEncrypted
          ? (safeDecrypt(p.payload?.soapNotes as string) ?? "{}")
          : (p.payload?.soapNotes as string) || "{}",
        prescriptions: isEncrypted
          ? (safeDecrypt(p.payload?.prescriptions as string) ?? "[]")
          : (p.payload?.prescriptions as string) || "[]",
      };
    });

    // Sort newest first
    records.sort((a, b) => (b.date > a.date ? 1 : -1));

    return {
      records,
      nextOffset: (result.next_page_offset as string | number | null) ?? null,
    };
  } catch (error) {
    console.error("Failed to scroll consultations:", error);
    return { records: [], nextOffset: null };
  }
}
// Update a stored consultation's editable fields
export async function updateConsultation(
  id: string,
  updates: {
    summary: string;
    soapNotes: string;      // JSON string
    prescriptions: string;  // JSON string
    keywords?: string[];
  }
): Promise<boolean> {
  const qdrant = getQdrantClient();
  if (!qdrant) return false;

  try {
    await ensureCollection();

    // Re-generate vector from updated content so search stays accurate
    const vector = textToVector(
      `${updates.summary} ${(updates.keywords ?? []).join(" ")}`
    );

    // Overwrite the vector
    await qdrant.updateVectors(COLLECTION_NAME, {
      points: [{ id, vector }],
    });

    // Overwrite only the edited payload fields (encrypted)
    await qdrant.setPayload(COLLECTION_NAME, {
      payload: {
        summary:       encrypt(updates.summary),
        soapNotes:     encrypt(updates.soapNotes),
        prescriptions: encrypt(updates.prescriptions),
        _encrypted:    true,
      },
      points: [id],
    });

    return true;
  } catch (error) {
    console.error("Failed to update consultation:", error);
    return false;
  }
}

// Permanently delete a consultation by its Qdrant point ID
export async function deleteConsultation(id: string): Promise<boolean> {
  const qdrant = getQdrantClient();
  if (!qdrant) return false;

  try {
    await qdrant.delete(COLLECTION_NAME, {
      points: [id],
      wait: true,
    });
    return true;
  } catch (error) {
    console.error("Failed to delete consultation:", error);
    return false;
  }
}
