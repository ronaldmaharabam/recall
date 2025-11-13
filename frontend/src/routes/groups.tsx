import { createResource, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";

const API = "http://localhost:8080";

async function fetchGroups() {
    const res = await fetch(`${API}/get_groups`);
    return res.json();
}

export default function GroupsPage() {
    const [groups, { refetch }] = createResource(fetchGroups);
    const [newGroup, setNewGroup] = createSignal("");
    const [msg, setMsg] = createSignal("");

    async function handleAddGroup() {
        const title = newGroup().trim();
        if (!title) return;
        const res = await fetch(`${API}/add_group?title=${encodeURIComponent(title)}`);
        if (res.ok) {
            setMsg(`✅ Created group: ${title}`);
            setNewGroup("");
            refetch();
        } else {
            setMsg(`❌ Could not create group`);
        }
    }

    return (
        <section>
            <h1 class="text-2xl font-semibold mb-4">Groups</h1>

            <div class="mb-6 bg-white shadow p-4 rounded-md">
                <div class="flex gap-2">
                    <input
                        class="border border-gray-300 rounded-md px-3 py-2 flex-1"
                        placeholder="New group name"
                        value={newGroup()}
                        onInput={(e) => setNewGroup(e.currentTarget.value)}
                    />
                    <button class="bg-blue-600 text-white px-4 py-2 rounded-md" onClick={handleAddGroup}>Add Group</button>
                </div>
                <Show when={msg()}>
                    <p class="text-sm text-green-700 mt-2">{msg()}</p>
                </Show>
            </div>

            <Show when={groups()} fallback={<p>Loading...</p>}>
                <div class="grid sm:grid-cols-2 gap-4">
                    <For each={groups()}>
                        {(g: any) => (
                            <div class="relative">
                                <A
                                    href={`/search?groups=${encodeURIComponent(g.title)}`}
                                    class="block bg-white shadow rounded-lg p-4 hover:bg-gray-50"
                                >
                                    <div class="text-lg font-semibold text-blue-700">{g.title}</div>
                                    <div class="text-sm text-gray-600">{g.count} topics</div>
                                </A>

                                <button
                                    class="absolute top-2 right-2 text-red-600 hover:text-red-800"
                                    onClick={async (e) => {
                                        e.preventDefault();
                                        const ok = confirm(`Delete group "${g.title}"?`);
                                        if (!ok) return;

                                        const res = await fetch(
                                            `${API}/delete_group?title=${encodeURIComponent(g.title)}`
                                        );
                                        if (res.ok) {
                                            setMsg(`🗑️ Deleted group: ${g.title}`);
                                            refetch();
                                        } else {
                                            setMsg("❌ Failed to delete group");
                                        }
                                    }}
                                >
                                    ✖
                                </button>
                            </div>
                        )}
                    </For>
                </div>
            </Show>
        </section>
    );
}

