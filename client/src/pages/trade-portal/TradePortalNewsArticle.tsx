import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar } from "lucide-react";
import { useLocation, useParams } from "wouter";

export default function TradePortalNewsArticle() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const articleQuery = trpc.tradePortal.getNewsArticle.useQuery(
    { slug: slug || "" },
    { enabled: !!slug }
  );

  if (articleQuery.isLoading) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (articleQuery.error || !articleQuery.data) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/trade-portal/news")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to News
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Article not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const article = articleQuery.data;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/trade-portal/news")}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to News
      </Button>

      {article.coverImageUrl && (
        <img
          src={article.coverImageUrl}
          alt={article.title}
          className="w-full h-64 object-cover rounded-lg"
        />
      )}

      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Calendar className="w-4 h-4" />
          {article.publishedAt
            ? new Date(article.publishedAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : ""}
          {article.category && (
            <>
              <span className="mx-1">·</span>
              <span>{article.category}</span>
            </>
          )}
        </div>
        <h1 className="text-2xl font-bold mb-4">{article.title}</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
