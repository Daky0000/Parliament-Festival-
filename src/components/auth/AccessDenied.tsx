export function AccessDenied({ reason = "forbidden" }: { reason?: "forbidden" | "no_event" }) {
  return (
    <section className="panel p-8 text-center space-y-2" role="alert">
      <h1 className="text-[20px] font-medium text-brand-ink">
        {reason === "no_event" ? "No event assigned" : "You don't have access to this page"}
      </h1>
      <p className="text-[14px] text-brand-muted">
        {reason === "no_event"
          ? "Your account is not assigned to any event yet. Ask an administrator to give you access."
          : "Your role does not include this area. Ask an administrator if you need access."}
      </p>
    </section>
  );
}
