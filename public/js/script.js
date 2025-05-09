document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const generateBtn = document.getElementById('generateBtn');
    const phoneInput = document.getElementById('phone');
    const pairingCode = document.getElementById('pairingCode');
    const copyCodeBtn = document.getElementById('copyCodeBtn');
    const sessionId = document.getElementById('sessionId');
    const copySessionBtn = document.getElementById('copySessionBtn');
    const envContent = document.getElementById('envContent');
    const copyEnvBtn = document.getElementById('copyEnvBtn');
    const errorMessage = document.getElementById('errorMessage');
    const statusIndicator = document.querySelector('.status-indicator');
    const countdownElement = document.getElementById('countdown');

    // Variables
    let timeLeft = 5 * 60; // 5 minutes in seconds
    let countdownInterval;
    let socket;

    // Initialize Socket.IO connection
    function initSocket() {
        socket = io();

        socket.on('connect', () => {
            console.log('Connected to server');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

        socket.on('reconnecting', () => {
            updateStatus('Reconnecting...', 'connecting');
        });

        socket.on('logged-out', () => {
            resetFlow();
            showError('Session expired. Please generate a new code.');
        });

        socket.on('connected', (data) => {
            updateStatus('Connected successfully!', 'success');
            setTimeout(() => {
                completeSession(data.sessionId);
            }, 1500);
        });
    }

    // Generate pairing code
    generateBtn.addEventListener('click', async function() {
        const phoneNumber = phoneInput.value.trim();
        
        if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
            showError('Please enter a valid phone number (digits only)');
            return;
        }

        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            const response = await fetch('/api/generate-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phoneNumber })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate code');
            }

            // Show pairing code
            pairingCode.textContent = formatCode(data.code);
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            
            // Start countdown
            startCountdown();
            
            // Initialize socket if not already done
            if (!socket) {
                initSocket();
            }

            // Update connection status
            updateStatus('Waiting for WhatsApp connection...', 'connecting');

        } catch (error) {
            showError(error.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<span>Generate Pairing Code</span><i class="fas fa-arrow-right"></i>';
        }
    });

    // Copy handlers
    copyCodeBtn.addEventListener('click', () => copyToClipboard(pairingCode));
    copySessionBtn.addEventListener('click', () => copyToClipboard(sessionId));
    copyEnvBtn.addEventListener('click', () => copyToClipboard(envContent));

    // Platform tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const platform = btn.dataset.platform;
            
            // Update active tab
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update visible content
            document.querySelectorAll('.platform-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${platform}-instructions`).classList.add('active');
        });
    });

    // Helper functions
    function formatCode(code) {
        return code?.match(/.{1,4}/g)?.join('-') || code;
    }

    function copyToClipboard(element) {
        const text = element.textContent;
        navigator.clipboard.writeText(text)
            .then(() => {
                const originalText = element.textContent;
                element.textContent = 'Copied!';
                setTimeout(() => {
                    element.textContent = originalText;
                }, 2000);
            });
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
        setTimeout(() => {
            errorMessage.classList.add('hidden');
        }, 5000);
    }

    function updateStatus(message, status) {
        statusIndicator.className = `status-indicator ${status}`;
        statusIndicator.querySelector('span').textContent = message;
    }

    function startCountdown() {
        clearInterval(countdownInterval);
        timeLeft = 5 * 60;
        updateCountdownDisplay();
        
        countdownInterval = setInterval(() => {
            timeLeft--;
            updateCountdownDisplay();
            
            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                showError('Pairing code has expired. Please generate a new one.');
                resetFlow();
            }
        }, 1000);
    }

    function updateCountdownDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        countdownElement.textContent = `Code expires in ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function completeSession(sessionIdValue) {
        // Update the UI
        sessionId.textContent = sessionIdValue;
        envContent.textContent = `WHATSAPP_SESSION_ID=${sessionIdValue}`;
        
        // Move to step 3
        step2.classList.add('hidden');
        step3.classList.remove('hidden');
        
        // Clear countdown
        clearInterval(countdownInterval);
    }

    function resetFlow() {
        if (socket) {
            socket.disconnect();
        }
        
        step1.classList.remove('hidden');
        step2.classList.add('hidden');
        step3.classList.add('hidden');
        phoneInput.value = '';
        timeLeft = 5 * 60;
        clearInterval(countdownInterval);
    }

    // Initialize socket when page loads
    initSocket();
});
