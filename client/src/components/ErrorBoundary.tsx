import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw, RotateCcw, WifiOff } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional: render a scoped fallback instead of full-page */
  inline?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  autoRefreshing: boolean;
}

/**
 * Detects if an error is a chunk/module load failure
 * (e.g. network timeout, failed dynamic import)
 */
function isChunkLoadError(error: Error): boolean {
  const msg = error.message?.toLowerCase() || "";
  return (
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("dynamically imported module") ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    error.name === "ChunkLoadError"
  );
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, autoRefreshing: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Log to console for debugging
    console.error("[ErrorBoundary]", error, errorInfo);
    this.scheduleOneTimeRefresh(error);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, autoRefreshing: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  scheduleOneTimeRefresh(error: Error) {
    if (typeof window === "undefined") return;

    const signature = `${window.location.pathname}|${error.name}|${error.message}`.slice(0, 240);
    const key = `spanline:error-autorefresh:${signature}`;
    if (window.sessionStorage.getItem(key)) return;

    window.sessionStorage.setItem(key, new Date().toISOString());
    this.setState({ autoRefreshing: true });
    window.setTimeout(() => {
      window.location.reload();
    }, 800);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isNetworkError = this.state.error ? isChunkLoadError(this.state.error) : false;

    // Inline (scoped) error boundary - used inside page sections
    if (this.props.inline) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
            {isNetworkError ? (
              <WifiOff size={24} className="text-destructive" />
            ) : (
              <AlertTriangle size={24} className="text-destructive" />
            )}
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              {this.state.autoRefreshing ? "Refreshing page..." : isNetworkError ? "Connection issue" : "Something went wrong"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {this.state.autoRefreshing
                ? "A loading error occurred. The page will refresh automatically once."
                : isNetworkError
                ? "Failed to load this section. Please check your connection and try again."
                : "An error occurred while loading this content."}
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            disabled={this.state.autoRefreshing}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
              "bg-primary text-primary-foreground",
              "hover:opacity-90 cursor-pointer transition-opacity",
              this.state.autoRefreshing && "opacity-70 cursor-wait"
            )}
          >
            <RefreshCw size={14} className={this.state.autoRefreshing ? "animate-spin" : ""} />
            {this.state.autoRefreshing ? "Refreshing" : "Retry"}
          </button>
        </div>
      );
    }

    // Full-page error boundary
    return (
      <div className="flex items-center justify-center min-h-screen p-8 bg-background">
        <div className="flex flex-col items-center w-full max-w-lg text-center">
          {/* Icon */}
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-6">
            {isNetworkError ? (
              <WifiOff size={32} className="text-destructive" />
            ) : (
              <AlertTriangle size={32} className="text-destructive" />
            )}
          </div>

          {/* Title */}
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {this.state.autoRefreshing
              ? "Refreshing page..."
              : isNetworkError
              ? "Unable to load the application"
              : "Something went wrong"}
          </h2>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            {this.state.autoRefreshing
              ? "A loading error occurred. The page will refresh automatically once."
              : isNetworkError
              ? "It looks like there was a network issue loading part of the application. This can happen with slow or unstable connections."
              : "An unexpected error occurred. You can try again or reload the page if the problem persists."}
          </p>

          {/* Error details (collapsed by default for non-network errors) */}
          {!isNetworkError && this.state.error && (
            <details className="w-full mb-6 text-left">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                Show error details
              </summary>
              <div className="mt-2 p-3 rounded-lg bg-muted overflow-auto max-h-40">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                  {this.state.error.message}
                  {this.state.error.stack && (
                    <>
                      {"\n\n"}
                      {this.state.error.stack}
                    </>
                  )}
                </pre>
              </div>
            </details>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleRetry}
              disabled={this.state.autoRefreshing}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer transition-opacity",
                this.state.autoRefreshing && "opacity-70 cursor-wait"
              )}
            >
              <RefreshCw size={15} className={this.state.autoRefreshing ? "animate-spin" : ""} />
              {this.state.autoRefreshing ? "Refreshing" : "Retry"}
            </button>
            <button
              onClick={this.handleReload}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium",
                "border border-border bg-background text-foreground",
                "hover:bg-muted cursor-pointer transition-colors"
              )}
            >
              <RotateCcw size={15} />
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
