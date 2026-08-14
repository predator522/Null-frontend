// API URL — change to your railway backend
const API_URL = 'https://null-backend-production.up.railway.app'

// elements
const phoneInput = document.getElementById('phoneInput')
const banOptions = document.querySelectorAll('input[name="banType"]')
const submitBtn = document.getElementById('submitBtn')
const progressFill = document.getElementById('progressFill')
const statusText = document.getElementById('statusText')
const progressSubtext = document.getElementById('progressSubtext')
const logBox = document.getElementById('logBox')
const historyBody = document.getElementById('historyBody')
const refreshBtn = document.getElementById('refreshBtn')
const emailCount = document.getElementById('emailCount')
const proxyCount = document.getElementById('proxyCount')
const endpointCount = document.getElementById('endpointCount')

let isRunning = false
let currentJobId = null
let statusInterval = null

// get selected ban type
function getBanType() {
    for (const el of banOptions) {
        if (el.checked) return el.value
    }
    return 'temp'
}

// add log entry
function addLog(message, className = '') {
    const time = new Date().toLocaleTimeString()
    const entry = document.createElement('div')
    entry.className = `log-entry ${className}`
    entry.innerHTML = `<span class="time">[${time}]</span> ${message}`
    logBox.appendChild(entry)
    logBox.scrollTop = logBox.scrollHeight

    const empty = logBox.querySelector('.log-empty')
    if (empty) empty.remove()
}

// update progress
function setProgress(percent, text) {
    progressFill.style.width = `${Math.min(percent, 100)}%`
    progressSubtext.textContent = text
}

// set status
function setStatus(text, color = '#374151') {
    statusText.textContent = text
    statusText.style.color = color
}

// fetch stats from backend
async function fetchStats() {
    try {
        const response = await fetch(`${API_URL}/api/stats`)
        if (response.ok) {
            const data = await response.json()
            emailCount.textContent = data.emailCount || '?'
            proxyCount.textContent = data.proxyCount || '?'
            endpointCount.textContent = data.endpointCount || '?'
        }
    } catch (e) {
        // fallback
        emailCount.textContent = '8'
        proxyCount.textContent = '20'
        endpointCount.textContent = '20+'
    }
}

// fetch history
async function fetchHistory() {
    try {
        const response = await fetch(`${API_URL}/api/jobs?limit=20`)
        if (!response.ok) throw new Error('Failed to fetch history')
        const data = await response.json()
        renderHistory(data.jobs)
    } catch (error) {
        historyBody.innerHTML = `<tr><td colspan="6" class="loading-row">Error loading history: ${error.message}</td></tr>`
    }
}

// render history table
function renderHistory(jobs) {
    if (!jobs || jobs.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="6" class="loading-row">No executions yet</td></tr>`
        return
    }

    historyBody.innerHTML = jobs.map(job => {
        const statusMap = {
            'completed': 'completed',
            'failed': 'failed',
            'running': 'running',
            'queued': 'queued'
        }
        const statusClass = statusMap[job.status] || 'queued'
        const progress = job.progress || 0
        const date = new Date(job.createdAt).toLocaleDateString()
        const time = new Date(job.createdAt).toLocaleTimeString()

        return `
            <tr>
                <td><code style="font-size:11px;color:#6b7280;">${job.jobId.slice(0,8)}</code></td>
                <td>${job.phone}</td>
                <td>${job.banType === 'perm' ? 'Perm' : 'Temp'}</td>
                <td><span class="status ${statusClass}">${job.status}</span></td>
                <td class="progress-cell">
                    ${progress}%
                    <span class="bar"><span class="bar-fill" style="width:${progress}%;"></span></span>
                </td>
                <td style="color:#9ca3af;font-size:12px;">${date} ${time}</td>
            </tr>
        `
    }).join('')
}

// poll job status
function pollJobStatus(jobId) {
    if (statusInterval) clearInterval(statusInterval)

    statusInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_URL}/api/status/${jobId}`)
            if (!response.ok) throw new Error('Status fetch failed')
            const job = await response.json()

            // update progress
            setProgress(job.progress, `${job.progress}%`)
            setStatus(job.status, job.status === 'running' ? '#2563eb' : job.status === 'completed' ? '#16a34a' : '#dc2626')

            // update logs
            if (job.logs && job.logs.length > 0) {
                // clear and re-render logs
                const existingLogs = logBox.querySelectorAll('.log-entry')
                const lastLogCount = existingLogs.length
                const newLogs = job.logs.slice(lastLogCount)

                newLogs.forEach(log => {
                    const time = new Date(log.time).toLocaleTimeString()
                    const entry = document.createElement('div')
                    entry.className = 'log-entry'
                    const isSuccess = log.message.includes('✅')
                    const isError = log.message.includes('❌')
                    entry.innerHTML = `<span class="time">[${time}]</span> ${log.message}`
                    if (isSuccess) entry.style.color = '#16a34a'
                    if (isError) entry.style.color = '#dc2626'
                    logBox.appendChild(entry)
                    logBox.scrollTop = logBox.scrollHeight
                })

                const empty = logBox.querySelector('.log-empty')
                if (empty) empty.remove()
            }

            // if job is done, stop polling
            if (job.status === 'completed' || job.status === 'failed') {
                clearInterval(statusInterval)
                statusInterval = null
                isRunning = false
                submitBtn.disabled = false
                submitBtn.textContent = 'Execute Ban'
                fetchHistory()
            }

        } catch (error) {
            console.error('Polling error:', error)
        }
    }, 1500)
}

// submit handler
submitBtn.addEventListener('click', async () => {
    if (isRunning) return

    const raw = phoneInput.value.trim()
    if (!raw) {
        alert('Enter a target phone number')
        return
    }

    const cleaned = raw.replace(/\s/g, '')
    if (!cleaned.match(/^\+?\d{8,15}$/)) {
        alert('Enter a valid international number (e.g., +2348123456789)')
        return
    }

    const phone = cleaned.startsWith('+') ? cleaned : '+' + cleaned
    const banType = getBanType()

    isRunning = true
    submitBtn.disabled = true
    submitBtn.textContent = 'Executing...'

    // clear logs
    logBox.innerHTML = ''
    setProgress(0, 'starting...')
    setStatus('Queued', '#6b7280')

    try {
        const response = await fetch(`${API_URL}/api/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, banType })
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Execution failed')
        }

        const data = await response.json()
        currentJobId = data.jobId
        addLog(`🚀 Job started: ${data.message}`)
        addLog(`📋 Job ID: ${currentJobId}`)

        pollJobStatus(currentJobId)

    } catch (error) {
        addLog(`❌ Error: ${error.message}`, 'error')
        setStatus('Failed', '#dc2626')
        isRunning = false
        submitBtn.disabled = false
        submitBtn.textContent = 'Execute Ban'
    }
})

// enter key support
phoneInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBtn.click()
})

// refresh history
refreshBtn.addEventListener('click', fetchHistory)

// initial load
fetchStats()
fetchHistory()
addLog('🔫 Null-Ban-Route ready', '')
addLog(`📡 Connected to: ${API_URL}`, '')
addLog('Ɛscanor — WhatsApp termination system', '')

// poll for auto-refresh every 10 seconds if not running
setInterval(() => {
    if (!isRunning) {
        fetchHistory()
    }
}, 10000)
