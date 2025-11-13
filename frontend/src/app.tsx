import { Router, A } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "./app.css";

export default function App() {
    return (
        <Router
            root={(props) => (
                <div class="min-h-screen flex flex-col bg-gray-50 text-gray-900">
                    {/* Header */}
                    <header class="bg-white shadow-sm">
                        <nav class="flex items-center justify-between px-8 py-3">
                            <h1 class="text-xl font-semibold text-blue-600">Recall</h1>
                            <div class="flex items-center gap-4">
                                <A
                                    href="/groups"
                                    activeClass="text-blue-600 border-b-2 border-blue-600"
                                    class="text-gray-700 hover:text-blue-600 transition"
                                >
                                    Groups
                                </A>
                                <A
                                    href="/search"
                                    activeClass="text-blue-600 border-b-2 border-blue-600"
                                    class="text-gray-700 hover:text-blue-600 transition"
                                >
                                    Search
                                </A>
                            </div>
                        </nav>
                    </header>
                    {/* Main Content */}
                    <main class="flex-1 w-full px-4 py-6">
                        <Suspense fallback={<p>Loading...</p>}>{props.children}</Suspense>
                    </main>

                </div>
            )}
        >
            <FileRoutes />
        </Router>
    );
}

