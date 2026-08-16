type AnnouncementBarProps = {
  text: string;
};

export default function AnnouncementBar({ text }: AnnouncementBarProps) {
  return (
    <div className="gold-gradient text-ink text-xs sm:text-sm font-semibold text-center py-2 px-4">
      {text}
    </div>
  );
}
