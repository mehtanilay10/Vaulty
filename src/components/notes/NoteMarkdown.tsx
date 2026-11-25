import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface NoteMarkdownProps {
  content: string;
  className?: string;
}

function safeUrlTransform(url: string) {
  // Allow data:image and blob: URLs alongside standard safe URLs
  if (url.startsWith("data:image/") || url.startsWith("blob:")) {
    return url;
  }
  return defaultUrlTransform(url);
}

export function NoteMarkdown({ content, className }: NoteMarkdownProps) {
  return (
    <div className={cn("prose max-w-none", className)}>
      <ReactMarkdown
        urlTransform={safeUrlTransform}
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noreferrer" {...props}>
                {children}
              </a>
            );
          },
          img({ src, alt, ...props }) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={typeof src === "string" ? src : undefined}
                alt={alt ?? ""}
                className="max-h-[500px] w-auto max-w-full rounded-lg border border-border-subtle object-contain my-2"
                loading="lazy"
                {...props}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
