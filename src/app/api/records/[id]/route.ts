// PATCH /api/records/[id] — update a consultation's editable fields
// DELETE /api/records/[id] — permanently remove a consultation
import { NextRequest, NextResponse } from "next/server";
import { updateConsultation, deleteConsultation } from "@/lib/qdrant-client";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing record ID" }, { status: 400 });
    }

    const body = await request.json();
    const { summary, soapNotes, prescriptions, keywords } = body;

    if (typeof summary !== "string" || typeof soapNotes !== "string" || typeof prescriptions !== "string") {
      return NextResponse.json(
        { error: "summary, soapNotes, and prescriptions are required strings" },
        { status: 400 }
      );
    }

    const ok = await updateConsultation(id, {
      summary,
      soapNotes,
      prescriptions,
      keywords: Array.isArray(keywords) ? keywords : [],
    });

    if (!ok) {
      return NextResponse.json(
        { error: "Failed to update record in Qdrant" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/records/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing record ID" }, { status: 400 });
    }

    const ok = await deleteConsultation(id);

    if (!ok) {
      return NextResponse.json(
        { error: "Failed to delete record from Qdrant" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/records/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
