import Link from "next/link";

const VIEWS = [
  {
    href: "/member",
    title: "I'm the member",
    body: "A calm, large-type view: today's list and a companion to talk to.",
  },
  {
    href: "/overseer",
    title: "I'm the overseer",
    body: "The full picture: concerns the agent recorded, the list, the conversation, and an assistant that briefs you.",
  },
];

export default function Page() {
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Companion dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Two views of the same data. Open both in separate windows: anything one side does shows up on the other.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {VIEWS.map((v) => (
          <Link key={v.href} href={v.href} className="rounded-2xl border p-5 hover:bg-muted">
            <h2 className="font-semibold">{v.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{v.body}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
