import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, Calendar, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

export default function TradePortalNews() {
  const { data: news, isLoading } = trpc.tradePortal.getNews.useQuery();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">News & Updates</h1>
        <p className="text-sm text-muted-foreground">Company announcements and important updates</p>
      </div>

      {news && news.length > 0 ? (
        <div className="space-y-3 sm:space-y-4">
          {news.map((item) => (
            <Card
              key={item.id}
              className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => setLocation(`/trade-portal/news/${item.slug}`)}
            >
              {/* Cover image on top for mobile */}
              {item.coverImageUrl && (
                <img
                  src={item.coverImageUrl}
                  alt={item.title}
                  className="w-full h-40 sm:h-48 object-cover sm:hidden"
                  loading="lazy"
                />
              )}
              <CardContent className="p-4 sm:pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {item.category && (
                        <Badge variant="outline" className="text-[10px] sm:text-xs border-primary/30 text-primary">
                          {item.category}
                        </Badge>
                      )}
                      <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : ""}
                      </span>
                    </div>
                    <h3 className="font-semibold text-base sm:text-lg text-slate-800 mb-1.5 sm:mb-2 group-hover:text-primary transition-colors">{item.title}</h3>
                    <p className="text-sm text-slate-600 line-clamp-3">
                      {item.content?.replace(/<[^>]*>/g, "").slice(0, 200)}...
                    </p>
                  </div>
                  {/* Cover image on side for desktop */}
                  {item.coverImageUrl && (
                    <img
                      src={item.coverImageUrl}
                      alt={item.title}
                      className="w-32 h-24 object-cover rounded-lg shrink-0 hidden sm:block"
                      loading="lazy"
                    />
                  )}
                  <div className="flex items-center shrink-0">
                    <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Newspaper className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No news or updates at the moment</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
