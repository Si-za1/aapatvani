// Temporary home page. The public landing page and report form arrive in the public-side chunk.

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <p className="w-fit rounded-full bg-butter-tint px-3 py-1 text-sm font-medium text-butter-strong">
        Prototype in progress
      </p>
      <h1 className="text-4xl font-semibold">
        AapatVani AI <span lang="ne" className="text-muted-foreground">· आपतवाणी</span>
      </h1>
      <p className="text-lg text-muted-foreground">
        Community disaster reports, organised into traceable incidents and potential impacts — always reviewed by
        people.
      </p>
    </main>
  );
}
