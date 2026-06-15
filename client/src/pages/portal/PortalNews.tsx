import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

export default function PortalNews() {
  const newsQuery = trpc.portal.getNews.useQuery();
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">News & Updates</h1>
        <p className="text-muted-foreground">Latest news from Altaspan</p>
      </div>

      {newsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !newsQuery.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Newspaper className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No news articles yet</p>
            <p className="text-sm text-muted-foreground mt-1">Check back later for updates and promotions.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {newsQuery.data.map((article) => (
            <Card
              key={article.id}
              className="cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => setLocation(`/portal/news/${article.slug}`)}
            >
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <div className="flex-1 min-w-0">
                    {article.coverImageUrl && (
                      <img
                        src={article.coverImageUrl}
                        alt={article.title}
                        className="w-full h-48 object-cover rounded-lg mb-4"
                      />
                    )}
                    <p className="text-xs text-muted-foreground mb-1">
                      {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : ""}
                      {article.category && <span className="ml-2">· {article.category}</span>}
                    </p>
                    <h2 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">{article.title}</h2>
                    <p className="text-sm text-muted-foreground line-clamp-3">{article.excerpt || article.content?.replace(/<[^>]*>/g, "").slice(0, 200)}</p>
                  </div>
                  <div className="flex items-center shrink-0">
                    <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
