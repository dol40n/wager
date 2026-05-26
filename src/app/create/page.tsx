import { CreateBetForm } from "@/components/create-bet-form";

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Create a Wager</h1>
      <CreateBetForm />
    </div>
  );
}
