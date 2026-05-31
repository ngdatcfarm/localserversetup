/**
 * Chat Query Page - AI chat on local server
 * Mode: Query (hỏi đáp, không sửa code)
 */
const { ref, reactive, onMounted, nextTick } = Vue;

return {
    setup() {
        const messages = ref([]);
        const inputMessage = ref('');
        const selectedModel = ref('MiniMax-M2.7');
        const conversationId = ref('default');
        const loading = ref(false);
        const error = ref('');
        const isRecording = ref(false);
        const isSpeaking = ref(false);
        const recognition = ref(null);
        const synth = ref(window.speechSynthesis);

        const models = [
            { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', provider: 'MiniMax' },
        ];

        // Quick suggestion chips
        const suggestions = [
            { icon: '🌡️', text: 'Nhiệt độ các trại hiện tại?' },
            { icon: '📊', text: 'Độ ẩm trại 9 hôm nay?' },
            { icon: '⚠️', text: 'Có thiết bị nào bất thường?' },
            { icon: '📱', text: 'Tình trạng thiết bị online/offline?' },
            { icon: '📈', text: 'Dữ liệu 24h qua thế nào?' },
            { icon: '🔔', text: 'Có cảnh báo gì mới?' },
        ];

        // Speech recognition setup
        function initRecognition() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.warn('SpeechRecognition not supported');
                return null;
            }
            const rec = new SpeechRecognition();
            rec.lang = 'vi-VN';
            rec.continuous = false;
            rec.interimResults = true;
            rec.maxAlternatives = 1;
            return rec;
        }

        function startRecording() {
            if (isRecording.value || loading.value) return;

            if (!recognition.value) {
                recognition.value = initRecognition();
            }
            if (!recognition.value) {
                error.value = 'Trình duyệt không hỗ trợ nhận diện giọng nói';
                return;
            }

            // Stop any ongoing TTS when starting to record
            if (synth.value.speaking) {
                synth.value.cancel();
                isSpeaking.value = false;
            }

            // Add interim user message bubble (live transcript will update this)
            messages.value.push({
                role: 'user',
                content: '🎤 Đang nghe...',
                time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                interim: true
            });
            scrollToBottom();

            recognition.value.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                if (finalTranscript) {
                    // Final transcript - update and auto-send
                    inputMessage.value = finalTranscript;
                    const lastMsg = messages.value[messages.value.length - 1];
                    if (lastMsg && lastMsg.interim) {
                        lastMsg.content = finalTranscript;
                    }
                    // Auto-send after a short delay to show final text
                    setTimeout(() => {
                        if (inputMessage.value.trim()) {
                            stopRecording();
                        }
                    }, 300);
                } else if (interimTranscript) {
                    // Interim - just show live
                    inputMessage.value = interimTranscript;
                    const lastMsg = messages.value[messages.value.length - 1];
                    if (lastMsg && lastMsg.interim) {
                        lastMsg.content = interimTranscript || '🎤 Đang nghe...';
                    }
                }
            };

            recognition.value.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                // Remove interim bubble
                const lastMsg = messages.value[messages.value.length - 1];
                if (lastMsg && lastMsg.interim) {
                    messages.value.pop();
                }
                isRecording.value = false;
            };

            recognition.value.onend = () => {
                isRecording.value = false;
            };

            isRecording.value = true;
            recognition.value.start();
        }

        function stopRecording() {
            if (recognition.value) {
                recognition.value.stop();
            }
            isRecording.value = false;
            // Auto-send the message
            const text = inputMessage.value.trim();
            if (text) {
                // Remove interim bubble and send properly
                const lastMsg = messages.value[messages.value.length - 1];
                if (lastMsg && lastMsg.interim) {
                    messages.value.pop();
                }
                sendMessage(text);
            }
        }

        function scrollToBottom() {
            nextTick(() => {
                const container = document.querySelector('.chat-messages');
                if (container) container.scrollTop = container.scrollHeight;
            });
        }

        function speak(text) {
            if (!text) return;
            synth.value.cancel();

            // Strip markdown tables, pipes, dashes - keep only readable text
            let clean = text
                // Remove markdown tables (|---|---:| ...)
                .replace(/\|[-:\s]+\|[-:\s|\|]*/g, '')
                .replace(/\|/g, ' ')
                // Remove markdown headers (# ## ###)
                .replace(/^#{1,6}\s+/gm, '')
                // Remove horizontal rules (--- ___)
                .replace(/^[-_]{3,}$/gm, '')
                // Remove code blocks
                .replace(/```[\s\S]*?```/g, '')
                // Remove inline code
                .replace(/`([^`]+)`/g, '$1')
                // Remove bold/italic markers but keep text
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/\*([^*]+)\*/g, '$1')
                .replace(/__([^_]+)__/g, '$1')
                // Remove emojis (they cause TTS issues)
                .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
                // Replace newlines with pauses
                .replace(/\n+/g, '. ')
                // Clean up multiple spaces
                .replace(/\s+/g, ' ')
                .trim();

            // Shorten if too long (TTS can't handle very long texts)
            if (clean.length > 400) {
                // Try to cut at sentence boundary
                const cutoff = clean.substring(0, 380).lastIndexOf('.');
                if (cutoff > 150) {
                    clean = clean.substring(0, cutoff + 1);
                } else {
                    clean = clean.substring(0, 380) + '...';
                }
            }

            // Stop recording if it's still going when AI responds
            if (recognition.value && isRecording.value) {
                recognition.value.stop();
                isRecording.value = false;
            }

            const utterance = new SpeechSynthesisUtterance(clean);
            utterance.lang = 'vi-VN';
            utterance.rate = 1.1;  // Slightly faster
            utterance.pitch = 1.0;

            utterance.onstart = () => { isSpeaking.value = true; };
            utterance.onend = () => { isSpeaking.value = false; };
            utterance.onerror = () => { isSpeaking.value = false; };

            synth.value.speak(utterance);
        }

        function stopSpeaking() {
            synth.value.cancel();
            isSpeaking.value = false;
        }

        async function sendMessage(msg) {
            if (!msg && (!inputMessage.value.trim() || loading.value)) return;

            const userMsg = (msg || inputMessage.value).trim();
            if (!msg) inputMessage.value = '';
            error.value = '';

            // Remove any interim bubble before adding real message
            if (messages.value.length > 0) {
                const last = messages.value[messages.value.length - 1];
                if (last && last.interim) messages.value.pop();
            }

            // Add user message immediately
            messages.value.push({
                role: 'user',
                content: userMsg,
                time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            });

            loading.value = true;
            scrollToBottom();

            try {
                const result = await API.chat.query(userMsg, selectedModel.value, conversationId.value);
                conversationId.value = result.conversation_id;

                messages.value.push({
                    role: 'assistant',
                    content: result.response,
                    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                });

                // Auto-speak response
                speak(result.response);
            } catch (e) {
                error.value = e.message || 'Lỗi khi gọi AI';
                // Remove the user message if API failed
                const last = messages.value[messages.value.length - 1];
                if (last && last.role === 'user' && last.content === userMsg) {
                    messages.value.pop();
                }
            } finally {
                loading.value = false;
            }

            scrollToBottom();
        }

        async function clearChat() {
            if (messages.value.length === 0) return;
            try {
                await API.chat.clearConversation(conversationId.value);
                messages.value = [];
                conversationId.value = 'default';
            } catch (e) {
                error.value = e.message;
            }
        }

        function handleKeydown(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        }

        function formatMessage(content) {
            // Simple markdown-like formatting
            return content
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>');
        }

        onMounted(async () => {
            // Load existing conversation if any
            try {
                const conv = await API.chat.getConversation(conversationId.value);
                if (conv.messages && conv.messages.length > 0) {
                    messages.value = conv.messages.map(m => ({
                        role: m.role,
                        content: m.content,
                        time: ''
                    }));
                }
            } catch (e) {
                console.log('No previous conversation');
            }
        });

        return {
            messages,
            inputMessage,
            selectedModel,
            models,
            suggestions,
            loading,
            error,
            conversationId,
            isRecording,
            isSpeaking,
            sendMessage,
            clearChat,
            handleKeydown,
            formatMessage,
            startRecording,
            stopRecording,
            speak,
            stopSpeaking
        };
    },

    template: `
    <div class="chat-query-page flex flex-col h-full">
        <!-- Header -->
        <div class="page-header">
            <div class="flex items-center gap-3">
                <span class="text-2xl">💬</span>
                <h1 class="page-title">Chat AI</h1>
            </div>
            <div class="flex items-center gap-3">
                <select v-model="selectedModel" class="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    <option v-for="m in models" :key="m.id" :value="m.id">
                        {{ m.name }} ({{ m.provider }})
                    </option>
                </select>
                <button @click="clearChat" class="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                    🗑️ Xóa chat
                </button>
                <button v-if="isSpeaking" @click="stopSpeaking" class="px-3 py-2 text-sm bg-red-100 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">
                    🔇 Dừng đọc
                </button>
            </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="mx-4 mb-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            ⚠️ {{ error }}
        </div>

        <!-- Messages -->
        <div class="chat-messages flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <div v-if="messages.length === 0" class="text-center py-8">
                <div class="text-5xl mb-4">🤖</div>
                <div class="text-lg font-medium text-gray-600 mb-2">Chào bạn! Tôi là trợ lý AI của CFarm</div>
                <div class="text-sm text-gray-400 mb-6">Tôi có thể giúp bạn kiểm tra dữ liệu cảm biến, tình trạng thiết bị và báo cáo sự cố</div>

                <!-- Suggestions -->
                <div class="flex flex-wrap justify-center gap-2 px-4">
                    <button
                        v-for="(s, idx) in suggestions" :key="idx"
                        @click="sendMessage(s.text)"
                        class="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition flex items-center gap-2">
                        <span>{{ s.icon }}</span>
                        <span>{{ s.text }}</span>
                    </button>
                </div>
            </div>

            <div v-for="(msg, idx) in messages" :key="idx"
                class="flex gap-3"
                :class="msg.role === 'user' ? 'flex-row-reverse' : ''">

                <!-- Avatar -->
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    :class="msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-green-500 text-white'">
                    {{ msg.role === 'user' ? '👤' : '🤖' }}
                </div>

                <!-- Message bubble -->
                <div class="max-w-[75%] px-4 py-3 rounded-2xl whitespace-pre-wrap text-sm"
                    :class="[
                        msg.role === 'user'
                            ? 'bg-blue-500 text-white rounded-tr-sm'
                            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm',
                        msg.interim ? 'border-dashed border-blue-300 bg-blue-50' : ''
                    ]">
                    <div v-if="msg.interim" class="flex items-center gap-2 mb-1">
                        <span class="text-xs text-blue-500 font-medium">🎤 Đang nghe...</span>
                        <div class="flex gap-0.5 items-end h-3">
                            <span class="w-0.5 bg-blue-400 rounded-full animate-bounce" style="height:30%;animation-delay:0ms"></span>
                            <span class="w-0.5 bg-blue-400 rounded-full animate-bounce" style="height:60%;animation-delay:100ms"></span>
                            <span class="w-0.5 bg-blue-400 rounded-full animate-bounce" style="height:100%;animation-delay:200ms"></span>
                            <span class="w-0.5 bg-blue-400 rounded-full animate-bounce" style="height:80%;animation-delay:300ms"></span>
                        </div>
                    </div>
                    <div v-html="formatMessage(msg.content)"></div>
                    <div v-if="msg.time" class="text-xs mt-1 opacity-60 text-right">{{ msg.time }}</div>
                </div>
            </div>

            <!-- Loading indicator -->
            <div v-if="loading" class="flex gap-3">
                <div class="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    🤖
                </div>
                <div class="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm">
                    <div class="flex items-center gap-2 text-gray-500">
                        <span class="animate-pulse">⚡</span>
                        <span class="text-sm">AI đang xử lý...</span>
                    </div>
                </div>
            </div>

            <!-- Recording visualizer -->
            <div v-if="isRecording" class="flex justify-center py-2">
                <div class="flex items-center gap-1 px-4 py-2 bg-red-50 rounded-full border border-red-200">
                    <span class="text-red-500 animate-pulse">🔴</span>
                    <div class="flex gap-0.5 items-end h-4">
                        <span class="w-0.5 bg-red-400 rounded-full animate-pulse" style="height:30%;animation-delay:0ms"></span>
                        <span class="w-0.5 bg-red-400 rounded-full animate-pulse" style="height:60%;animation-delay:100ms"></span>
                        <span class="w-0.5 bg-red-400 rounded-full animate-pulse" style="height:100%;animation-delay:200ms"></span>
                        <span class="w-0.5 bg-red-400 rounded-full animate-pulse" style="height:80%;animation-delay:300ms"></span>
                        <span class="w-0.5 bg-red-400 rounded-full animate-pulse" style="height:50%;animation-delay:150ms"></span>
                        <span class="w-0.5 bg-red-400 rounded-full animate-pulse" style="height:70%;animation-delay:250ms"></span>
                        <span class="w-0.5 bg-red-400 rounded-full animate-pulse" style="height:40%;animation-delay:50ms"></span>
                        <span class="w-0.5 bg-red-400 rounded-full animate-pulse" style="height:90%;animation-delay:180ms"></span>
                    </div>
                    <span class="text-xs text-red-600 font-medium ml-1">Đang nghe...</span>
                </div>
            </div>
        </div>

        <!-- Input -->
        <div class="border-t border-gray-200 p-4 bg-white">
            <div class="flex gap-3">
                <textarea
                    v-model="inputMessage"
                    @keydown="handleKeydown"
                    placeholder="Nhập câu hỏi hoặc click gợi ý bên trên..."
                    rows="1"
                    class="flex-1 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    :disabled="loading"
                ></textarea>
                <!-- Mic button -->
                <button
                    @mousedown="startRecording"
                    @mouseup="stopRecording"
                    @mouseleave="stopRecording"
                    @touchstart.prevent="startRecording"
                    @touchend.prevent="stopRecording"
                    :disabled="loading"
                    class="px-4 py-3 rounded-xl border transition flex items-center gap-2 relative"
                    :class="isRecording
                        ? 'bg-red-500 text-white border-red-600'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'">
                    <span class="text-xl" :class="isRecording ? 'animate-pulse' : ''">{{ isRecording ? '🔴' : '🎤' }}</span>
                    <!-- Recording ring effect -->
                    <span v-if="isRecording" class="absolute inset-0 rounded-xl border-2 border-red-400 animate-ping opacity-50"></span>
                </button>
                <button
                    @click="sendMessage()"
                    :disabled="!inputMessage.trim() || loading"
                    class="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2">
                    <span v-if="loading">⏳</span>
                    <span v-else>📤</span>
                    <span>Gửi</span>
                </button>
            </div>
            <div class="text-xs text-gray-400 mt-2 text-right">
                Model: {{ selectedModel }} | 💬 MiniMax M2.7 on local server | 🎤 Nói để hỏi
            </div>
        </div>
    </div>
    `
};