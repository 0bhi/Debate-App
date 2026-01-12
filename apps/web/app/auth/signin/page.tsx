"use client";

import { signIn, getProviders } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Brain, Github, Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function SignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<any>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const setAuthProviders = async () => {
      const res = await getProviders();
      setProviders(res);
    };
    setAuthProviders();
  }, []);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      if (result?.ok) {
        // Check if there's a callback URL from query params
        const callbackUrl = searchParams.get("callbackUrl");
        if (callbackUrl) {
          router.push(callbackUrl);
        } else {
          router.push("/dashboard");
        }
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
      setIsLoading(false);
    }
  };

  if (!providers) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  const hasOAuthProviders =
    providers.google || providers.github || providers.credentials;

  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-200 dark:border-slate-700">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <Brain className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Sign In to Debate Platform
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Enter your credentials or use a provider
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            {/* Email/Password Form */}
            {providers.credentials && (
              <form onSubmit={handleCredentialsSubmit} className="space-y-4 mb-6">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                  >
                    Email or Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your email"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className="block w-full pl-10 pr-12 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {isLoading ? "Signing In..." : "Sign In"}
                </button>
              </form>
            )}

            {/* OAuth Providers */}
            {(providers.google || providers.github) && (
              <>
                {providers.credentials && (
                  <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-300 dark:border-slate-600"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        Or continue with
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {providers.google && (
                    <button
                      onClick={() => {
                        const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
                        signIn("google", { callbackUrl });
                      }}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors text-slate-900 dark:text-white font-medium"
                    >
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="#EA4335"
                        />
                      </svg>
                      <span>Continue with Google</span>
                    </button>
                  )}

                  {providers.github && (
                    <button
                      onClick={() => {
                        const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
                        signIn("github", { callbackUrl });
                      }}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-slate-900 dark:bg-slate-700 border border-slate-800 dark:border-slate-600 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors text-white font-medium"
                    >
                      <Github className="w-5 h-5" />
                      <span>Continue with GitHub</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {!hasOAuthProviders && (
              <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  No authentication providers configured. Please configure at
                  least one authentication provider.
                </p>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <p className="text-sm text-center text-slate-600 dark:text-slate-400">
                Don't have an account?{" "}
                <Link
                  href={
                    searchParams.get("callbackUrl")
                      ? `/auth/signup?callbackUrl=${encodeURIComponent(searchParams.get("callbackUrl")!)}`
                      : "/auth/signup"
                  }
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                >
                  Sign Up
                </Link>
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                By signing in, you agree to our Terms of Service and Privacy
                Policy
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

