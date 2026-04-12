import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Catches React render errors and shows a recovery UI.
 * Prevents full white-screen crashes in production.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("[ErrorBoundary]", error, info.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="min-h-[300px] flex flex-col items-center justify-center gap-4 p-8 text-center">
                    <AlertTriangle className="w-10 h-10 text-destructive" />
                    <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
                    <p className="text-sm text-muted-foreground max-w-md">
                        {this.state.error?.message || "An unexpected error occurred."}
                    </p>
                    <Button variant="outline" onClick={this.handleReset}>
                        <RefreshCw className="w-4 h-4 mr-1" /> Try Again
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
