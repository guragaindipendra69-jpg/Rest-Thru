export function SectionHeader({
  title,
  imageUrl,
}: {
  title: string;
  kicker?: string;
  imageUrl?: string | null;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="h-px flex-1" style={{ backgroundColor: "var(--gold)", opacity: 0.3 }} />
      {/*
        The category photo, when the owner uploaded one. It sits inside the rule
        as a gold-ringed medallion so it reads as part of the engraved header
        rather than as a loose picture, and it is decorative: the title next to
        it already names the section, so alt stays empty.
      */}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-11 w-11 shrink-0 rounded-full object-cover sm:h-12 sm:w-12"
          style={{ boxShadow: "0 0 0 1px var(--gold)" }}
        />
      )}
      <h2
        className="shrink-0 font-serif text-[20px] font-semibold uppercase leading-none tracking-[0.14em] sm:text-[22px]"
        style={{ color: "var(--burgundy)" }}
      >
        {title}
      </h2>
      <span className="h-px flex-1" style={{ backgroundColor: "var(--gold)", opacity: 0.3 }} />
    </div>
  );
}
