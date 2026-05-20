import React, { ErrorInfo, ReactNode } from 'react';

export class ErrorBoundary extends React.Component<{children?: ReactNode, fallback?: ReactNode}, {hasError: boolean, errorMsg: string | null}> {
  constructor(props: {children?: ReactNode, fallback?: ReactNode}) {
    super(props);
    this.state = {
      hasError: false,
      errorMsg: null
    };
  }

  public static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full ring-1 ring-gray-900/5">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h1>
            <p className="text-gray-500 mb-6 text-sm">{this.state.errorMsg || 'An unexpected error occurred.'}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-black transition-colors w-full"
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

