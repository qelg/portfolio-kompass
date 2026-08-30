"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { deleteTransaction } from "./actions";

export function DeleteTransactionButton({ transactionId }: { transactionId: number }) {
  return (
    <form
      action={deleteTransaction}
      onSubmit={(event) => {
        if (!window.confirm("Diese Buchung wirklich löschen?")) event.preventDefault();
      }}
    >
      <input name="transactionId" type="hidden" value={transactionId} />
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="delete-transaction" type="submit" disabled={pending} title="Buchung löschen" aria-label="Buchung löschen">
      <Trash2 size={15} />
    </button>
  );
}
