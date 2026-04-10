document.addEventListener('DOMContentLoaded', () => {
    // Configure Marked with Highlight.js
    marked.setOptions({
        highlight: function (code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true
    });

    const MODEL_CONFIG = {
        "google/gemini-2.5-pro": {
            provider: "openrouter",
            maxTokens: 2048
        },
        "meta-llama/llama-3.1-8b-instruct": {
            provider: "openrouter",
            maxTokens: 1536
        },
        "mistralai/mistral-7b-instruct": {
            provider: "openrouter",
            maxTokens: 1536
        },
        "arcee-ai/Trinity-Large-Thinking:featherless-ai": {
            provider: "huggingface",
            maxTokens: 1536
        }
    };

    const DEFAULT_MODEL = "google/gemini-2.5-pro";

    // API CONFIGURATION (Hardcoded as requested)
    // API CONFIGURATION
    // Uses window.LOCAL_CONFIG for local dev (ignored by git) 
    // or placeholders for Netlify deployment (injected during build)
    const API_CONFIG = {
        openRouterKey: window.LOCAL_CONFIG?.openRouterKey || "YOUR_OPENROUTER_API_KEY", 
        huggingFaceToken: window.LOCAL_CONFIG?.huggingFaceToken || "YOUR_HUGGINGFACE_TOKEN"
    };

    // DOM Elements
    const chatHistory = document.getElementById('chat-history');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const typingIndicator = document.getElementById('typing-indicator');
    const generateImageBtn = document.getElementById('generate-image-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');

    // Settings Elements
    const modelSelect = document.getElementById('model-select');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    // Modal Elements
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    const closeModal = document.querySelector('.close-modal');

    // State
    let messages = []; // To keep track of conversation history for context

    // Load Settings
    function loadSettings() {
        const model = localStorage.getItem('selected_model');

        if (model && MODEL_CONFIG[model]) {
            modelSelect.value = model;
        } else {
            modelSelect.value = DEFAULT_MODEL;
            localStorage.setItem('selected_model', DEFAULT_MODEL);
        }
    }

    loadSettings();

    // Save Settings
    saveSettingsBtn.addEventListener('click', () => {
        const selectedModel = MODEL_CONFIG[modelSelect.value] ? modelSelect.value : DEFAULT_MODEL;
        modelSelect.value = selectedModel;
        localStorage.setItem('selected_model', selectedModel);
        alert('Settings saved successfully!');
    });

    // Helper: Add Message to UI
    function appendMessage(content, sender, isImage = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');

        if (isImage) {
            const img = document.createElement('img');
            img.src = content;
            img.classList.add('message-img');
            img.alt = "Generated Image";
            img.onclick = function () {
                modal.style.display = "flex";
                modalImg.src = this.src;
            }
            contentDiv.appendChild(img);
        } else if (sender === 'bot') {
            // Render Markdown for bot messages
            contentDiv.innerHTML = marked.parse(content);
            // Highlight any code blocks in the newly added content
            contentDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        } else {
            // Keep user messages as plain text but preserve line breaks
            contentDiv.textContent = content;
            contentDiv.style.whiteSpace = "pre-wrap";
        }

        messageDiv.appendChild(contentDiv);

        if (sender === 'bot' && !isImage) {
            const footer = document.createElement('div');
            footer.classList.add('message-footer');
            
            const copyBtn = document.createElement('button');
            copyBtn.classList.add('copy-btn');
            copyBtn.innerHTML = "<i class='bx bx-copy'></i>";
            copyBtn.title = "Copy to clipboard";
            copyBtn.onclick = () => copyToClipboard(content, copyBtn);
            
            footer.appendChild(copyBtn);
            messageDiv.appendChild(footer);
        }

        chatHistory.appendChild(messageDiv);
        scrollToBottom();
    }

    function copyToClipboard(text, btn) {
        navigator.clipboard.writeText(text).then(() => {
            const icon = btn.querySelector('i');
            icon.className = 'bx bx-check';
            setTimeout(() => {
                icon.className = 'bx bx-copy';
            }, 2000);
        });
    }

    function scrollToBottom() {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function showTyping() {
        typingIndicator.classList.add('visible');
        scrollToBottom();
    }

    function hideTyping() {
        typingIndicator.classList.remove('visible');
    }

    async function requestOpenRouterChat(selectedModel, modelConfig) {
        return fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_CONFIG.openRouterKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.href,
                "X-Title": "Nexus Chatbot"
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messages,
                max_tokens: modelConfig.maxTokens,
                temperature: 0.7
            })
        });
    }

    async function requestHuggingFaceChat(selectedModel, modelConfig) {
        return fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_CONFIG.huggingFaceToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messages,
                max_tokens: modelConfig.maxTokens
            })
        });
    }

    async function requestHuggingFaceImage(prompt) {
        const response = await fetch("https://router.huggingface.co/nscale/v1/images/generations", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_CONFIG.huggingFaceToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                response_format: "b64_json",
                prompt,
                model: "stabilityai/stable-diffusion-xl-base-1.0"
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || err.error || "Failed to generate image with Hugging Face.");
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            const result = await response.json();
            const b64Image = result.data?.[0]?.b64_json;

            if (!b64Image) {
                throw new Error("Hugging Face image response did not include image data.");
            }

            return `data:image/png;base64,${b64Image}`;
        }

        const blob = await response.blob();
        return URL.createObjectURL(blob);
    }

    // Part B & D: API Integration for Text Generation
    async function generateTextResponse(userText) {
        const selectedModel = MODEL_CONFIG[modelSelect.value] ? modelSelect.value : DEFAULT_MODEL;
        const modelConfig = MODEL_CONFIG[selectedModel];
        const providerLabel = modelConfig.provider === "huggingface" ? "Hugging Face" : "OpenRouter";
        if (modelConfig.provider === "openrouter" && !API_CONFIG.openRouterKey) {
            appendMessage("OpenRouter API key is missing in the code.", 'bot');
            return;
        }

        if (modelConfig.provider === "huggingface" && !API_CONFIG.huggingFaceToken) {
            appendMessage("Hugging Face token is missing in the code.", 'bot');
            return;
        }

        // Add user message to history
        messages.push({ role: 'user', content: userText });

        try {
            const response = modelConfig.provider === "huggingface"
                ? await requestHuggingFaceChat(selectedModel, modelConfig)
                : await requestOpenRouterChat(selectedModel, modelConfig);

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const apiMessage = errorData?.error?.message || 'API Request Failed';

                if (response.status === 402) {
                    throw new Error(`${providerLabel} credit limit hit. Reduce output size or switch to an account/model with available credits. Current cap for ${selectedModel} is ${modelConfig.maxTokens} tokens.`);
                }

                if (response.status === 404) {
                    throw new Error(`The selected model is not currently available on ${providerLabel}. Choose another model in Settings and save it. API said: ${apiMessage}`);
                }

                throw new Error(apiMessage);
            }

            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content || "No response received.";

            // Add bot response to history and UI
            messages.push({ role: 'assistant', content: reply });
            appendMessage(reply, 'bot');

        } catch (error) {
            appendMessage(`Error: ${error.message}`, 'bot');
            // Remove the last user message from memory if API failed
            messages.pop();
        }
    }

    // Part E: Text-to-Image Generation
    async function generateImage(prompt) {
        if (!API_CONFIG.huggingFaceToken) {
            appendMessage("Hugging Face token is missing in the code. Image generation requires it.", 'bot');
            return;
        }

        try {
            const imageUrl = await requestHuggingFaceImage(prompt);
            appendMessage(imageUrl, 'bot', true);
        } catch (error) {
            const canFallbackToPollinations = error instanceof TypeError || /fetch|cors/i.test(error.message);

            if (!canFallbackToPollinations) {
                appendMessage(`Error: ${error.message}`, 'bot');
                return;
            }

            const seed = Date.now();
            const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
            appendMessage(fallbackUrl, 'bot', true);
        }
    }

    // Event Listeners
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = userInput.value.trim();
        if (!text) return;

        // Display user message
        appendMessage(text, 'user');
        userInput.value = '';

        showTyping();
        await generateTextResponse(text);
        hideTyping();
    });

    generateImageBtn.addEventListener('click', async () => {
        const text = userInput.value.trim();
        if (!text) {
            appendMessage("Please type a description of the image you want to generate before clicking the button.", 'bot');
            return;
        }

        // Display user message indicating image request
        appendMessage(`🎨 Generate Image: ${text}`, 'user');
        userInput.value = '';

        showTyping();
        await generateImage(text);
        hideTyping();
    });

    clearChatBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear the conversation?")) {
            messages = [];
            // Keep the first welcome message
            const firstMsg = chatHistory.firstElementChild;
            chatHistory.innerHTML = '';
            if (firstMsg) chatHistory.appendChild(firstMsg);
        }
    });

    // Modal Events
    closeModal.onclick = function () {
        modal.style.display = "none";
    }

    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }
});
