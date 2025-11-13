import {
    createResource,
    createSignal,
    For,
    Show,
    createEffect,
    createMemo,
} from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";

const API = "http://localhost:8080";

async function fetchGroups() {
    const res = await fetch(`${API}/get_groups`);
    return res.json();
}

async function fetchScores(groupsCSV: string) {
    const url = new URL(`${API}/scores`);
    url.searchParams.set("learner", "1");
    if (groupsCSV) url.searchParams.set("groups", groupsCSV);
    const res = await fetch(url.toString());
    return res.json();
}

export default function SearchPage() {
    const loc = useLocation();
    const nav = useNavigate();
    const params = new URLSearchParams(loc.search);
    const initialGroups = params.get("groups")
        ? params
            .get("groups")!
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [];

    const [groups] = createResource(fetchGroups);
    const [selectedGroups, setSelectedGroups] = createSignal<string[]>(initialGroups);
    const [searchInput, setSearchInput] = createSignal("");
    const [msg, setMsg] = createSignal("");
    const [reviewing, setReviewing] = createSignal<string | null>(null);

    const [data, { refetch }] = createResource(
        () => selectedGroups().join(","),
        async (groupsCSV) => await fetchScores(groupsCSV)
    );

    createEffect(() => refetch());

    createEffect(() => {
        const g = selectedGroups();
        const url = g.length
            ? `/search?groups=${encodeURIComponent(g.join(","))}`
            : "/search";
        nav(url, { replace: true });
    });

    const filteredToReview = createMemo(() => {
        const q = searchInput().toLowerCase();
        const all = data()?.to_review || [];
        return q ? all.filter((t: any) => t.title.toLowerCase().includes(q)) : all;
    });

    const filteredUnreviewed = createMemo(() => {
        const q = searchInput().toLowerCase();
        const all = data()?.unreviewed || [];
        return q ? all.filter((t: any) => t.title.toLowerCase().includes(q)) : all;
    });

    function addGroupFilter(g: string) {
        if (!g) return;
        const curr = new Set(selectedGroups());
        curr.add(g);
        setSelectedGroups(Array.from(curr));
    }

    function removeGroupFilter(g: string) {
        setSelectedGroups(selectedGroups().filter((x) => x !== g));
    }

    async function createTopicFromQuery() {
        const title = searchInput().trim();
        if (!title) return setMsg("Enter a topic name to create.");
        const groupsCSV = selectedGroups().join(",");
        const res = await fetch(
            `${API}/add_topic?title=${encodeURIComponent(title)}&groups=${encodeURIComponent(
                groupsCSV
            )}`
        );
        if (res.ok) {
            setMsg(`✅ Created topic '${title}'`);
            setSearchInput("");
            await refetch();
        } else {
            setMsg("❌ Could not create topic.");
        }
    }

    async function handleScore(title: string, score: number) {
        setReviewing(null);
        const res = await fetch(
            `${API}/add_review?learner=1&title=${encodeURIComponent(
                title
            )}&score=${score}`
        );
        if (!res.ok) return setMsg("❌ Error reviewing topic.");
        const data = await res.json();
        setMsg(
            `✅ Reviewed '${title}' — next in ≈ ${data.next_review_in_days.toFixed(
                1
            )} days`
        );
        await refetch();
    }

    async function markDone(title: string) {
        const res = await fetch(
            `${API}/mark_done?learner=1&title=${encodeURIComponent(title)}`
        );
        if (res.ok) {
            setMsg(`✔️ Marked '${title}' as done`);
            await refetch();
        } else {
            setMsg("❌ Could not mark done");
        }
    }

    async function deleteTopic(title: string) {
        const ok = confirm(`Delete topic '${title}'?`);
        if (!ok) return;
        const res = await fetch(
            `${API}/delete_topic?title=${encodeURIComponent(title)}`
        );
        if (res.ok) {
            setMsg(`🗑️ Deleted '${title}'`);
            await refetch();
        } else {
            setMsg("❌ Could not delete topic");
        }
    }

    return (
        <main class="bg-gray-50 text-gray-900 p-8">
            <div class="max-w-8xl mx-auto">
                <h1 class="text-3xl font-semibold mb-6">Search & Review</h1>

                <div class="bg-white p-4 rounded-lg shadow mb-6">
                    <div class="flex gap-2">
                        <input
                            type="text"
                            placeholder="Search or create topic..."
                            class="border border-gray-300 rounded-md px-3 py-2 flex-1"
                            value={searchInput()}
                            onInput={(e) => setSearchInput(e.currentTarget.value)}
                        />
                        <button
                            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
                            onClick={createTopicFromQuery}
                        >
                            Create
                        </button>
                    </div>

                    <div class="mt-3 flex items-center gap-2 flex-wrap">
                        <span class="text-sm text-gray-600">Filters:</span>
                        <For each={selectedGroups()}>
                            {(g) => (
                                <span class="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                                    {g}
                                    <button
                                        class="text-blue-600 ml-1"
                                        onClick={() => removeGroupFilter(g)}
                                    >
                                        ✕
                                    </button>
                                </span>
                            )}
                        </For>

                        <select
                            class="border border-gray-300 rounded-md px-2 py-1 ml-2"
                            onChange={(e) => {
                                addGroupFilter(e.currentTarget.value);
                                e.currentTarget.selectedIndex = 0;
                            }}
                        >
                            <option value="">Add group filter...</option>
                            <For each={groups()}>
                                {(g: any) => <option value={g.title}>{g.title}</option>}
                            </For>
                        </select>

                        <button
                            class="ml-auto text-sm text-gray-500"
                            onClick={() => setSelectedGroups([])}
                        >
                            Clear
                        </button>
                    </div>

                    <Show when={msg()}>
                        <div class="mt-3 text-sm text-green-700">{msg()}</div>
                    </Show>
                </div>

                <Show when={data()} fallback={<p>Loading...</p>}>
                    <div class="grid md:grid-cols-2 gap-10">
                        {/* Priority topics */}
                        <div class="bg-white p-6 rounded-lg shadow">
                            <h2 class="text-xl font-semibold mb-3">Priority (to review)</h2>
                            <Show
                                when={filteredToReview().length > 0}
                                fallback={<p class="text-gray-500">No topics to review</p>}
                            >
                                <table class="w-full text-sm text-left table-fixed">
                                    <colgroup>
                                        <col class="w-[45%]" />
                                        <col class="w-[15%]" />
                                        <col class="w-[20%]" />
                                        <col class="w-[20%]" />
                                    </colgroup>
                                    <thead class="bg-gray-100 text-gray-700">
                                        <tr>
                                            <th class="p-2 font-medium">Topic</th>
                                            <th class="p-2 font-medium">Score</th>
                                            <th class="p-2 font-medium">Forgetfulness</th>
                                            <th class="p-2 font-medium text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <For each={filteredToReview()}>
                                            {(t: any) => (
                                                <tr class="border-t hover:bg-gray-50 transition">
                                                    <td class="p-2 whitespace-nowrap overflow-hidden text-ellipsis">
                                                        {t.title}
                                                    </td>
                                                    <td class="p-2">{t.score.toFixed(3)}</td>
                                                    <td class="p-2">
                                                        {(t.forgetness * 100).toFixed(1)}%
                                                    </td>
                                                    <td class="p-2 text-right">
                                                        <div class="flex justify-end gap-2">

                                                            <button
                                                                class="text-green-700 hover:text-green-900 text-sm"
                                                                onClick={() => markDone(t.title as string)}
                                                            >
                                                                Done
                                                            </button>


                                                            <Show
                                                                when={reviewing() === t.title}
                                                                fallback={
                                                                    <button
                                                                        class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-sm"
                                                                        onClick={() => setReviewing(t.title as string)}
                                                                    >
                                                                        Review
                                                                    </button>
                                                                }
                                                            >
                                                                <div class="flex justify-end gap-1">
                                                                    <For each={[0, 1, 2, 3]}>
                                                                        {(s: number) => (
                                                                            <button
                                                                                class="bg-gray-200 hover:bg-blue-500 hover:text-white text-sm rounded px-2 py-1"
                                                                                onClick={() => handleScore(t.title as string, s)}
                                                                            >
                                                                                {s}
                                                                            </button>
                                                                        )}
                                                                    </For>
                                                                </div>
                                                            </Show>
                                                            <button
                                                                class="text-red-600 hover:text-red-800 text-sm"
                                                                onClick={() => deleteTopic(t.title as string)}
                                                            >
                                                                ✕
                                                            </button>

                                                        </div>
                                                    </td>

                                                </tr>
                                            )}
                                        </For>
                                    </tbody>
                                </table>
                            </Show>
                        </div>

                        {/* Unreviewed topics */}
                        <div class="bg-white p-6 rounded-lg shadow">
                            <h2 class="text-xl font-semibold mb-3">Unreviewed</h2>
                            <Show
                                when={filteredUnreviewed().length > 0}
                                fallback={<p class="text-gray-500">All topics reviewed</p>}
                            >
                                <ul class="space-y-2">
                                    <For each={filteredUnreviewed()}>
                                        {(t: any) => (
                                            <li class="flex items-center justify-between border-b pb-1 whitespace-nowrap overflow-hidden text-ellipsis">
                                                <div class="max-w-[60%] truncate">{t.title}</div>

                                                <div class="flex gap-2">
                                                    <button
                                                        class="text-green-700 hover:text-green-900 text-sm"
                                                        onClick={() => markDone(t.title as string)}
                                                    >
                                                        ✓
                                                    </button>

                                                    <button
                                                        class="text-red-600 hover:text-red-800 text-sm"
                                                        onClick={() => deleteTopic(t.title as string)}
                                                    >
                                                        ✕
                                                    </button>

                                                    <button
                                                        class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-sm"
                                                        onClick={() => handleScore(t.title as string, 3)}
                                                    >
                                                        Review
                                                    </button>
                                                </div>
                                            </li>

                                        )}
                                    </For>
                                </ul>
                            </Show>
                        </div>
                    </div>
                </Show>
            </div>
        </main>
    );
}

