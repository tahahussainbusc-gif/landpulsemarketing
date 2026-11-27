<?php

function lp_json_response($status, $payload)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function lp_load_config()
{
    if (!defined('LP_AI_BOOTSTRAP')) {
        define('LP_AI_BOOTSTRAP', true);
    }

    $config = __DIR__ . '/config.php';
    if (!is_file($config)) {
        lp_json_response(503, array(
            'error' => 'AI backend is not configured. Hostinger par api/config.php setup karein.'
        ));
    }

    require_once $config;
    if (!defined('LP_GEMINI_API_KEY') && !defined('LP_GROQ_API_KEY') && !defined('LP_OPENAI_API_KEY')) {
        lp_json_response(503, array('error' => 'AI provider API key is not configured.'));
    }
}

function lp_require_post()
{
    if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: POST');
        lp_json_response(405, array('error' => 'Use POST for this request.'));
    }
}

function lp_read_json_body($maxBytes)
{
    $body = file_get_contents('php://input');
    if ($body === false || $body === '') {
        lp_json_response(400, array('error' => 'Request body is required.'));
    }
    if (strlen($body) > $maxBytes) {
        lp_json_response(413, array('error' => 'Request body is too large.'));
    }

    $request = json_decode($body, true);
    if (!is_array($request)) {
        lp_json_response(400, array('error' => 'Request body must be valid JSON.'));
    }
    return $request;
}

function lp_text_length($text)
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($text, 'UTF-8');
    }
    $matches = array();
    return preg_match_all('/./us', $text, $matches);
}

function lp_http_request($url, $headers, $payload = null, $method = 'POST', $timeout = 35)
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('PHP cURL extension is not enabled on this hosting plan.');
    }

    $options = array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => $timeout
    );
    if ($payload !== null) {
        $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            throw new RuntimeException('Could not encode the provider request.');
        }
        $options[CURLOPT_POSTFIELDS] = $encoded;
    }

    $curl = curl_init($url);
    if ($curl === false) {
        throw new RuntimeException('Could not start the provider request.');
    }
    curl_setopt_array($curl, $options);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($body === false) {
        throw new RuntimeException($error !== '' ? $error : 'Provider request failed.');
    }
    return array('status' => $status, 'body' => $body);
}

function lp_decode_provider_response($response)
{
    $result = json_decode($response['body'], true);
    if (!is_array($result)) {
        throw new RuntimeException('AI provider returned invalid JSON.');
    }
    return $result;
}

function lp_ai_providers()
{
    $providers = array();
    if (defined('LP_GEMINI_API_KEY') && LP_GEMINI_API_KEY !== '' && LP_GEMINI_API_KEY !== 'PASTE_GEMINI_API_KEY_HERE') {
        $model = defined('LP_GEMINI_MODEL') ? LP_GEMINI_MODEL : 'gemini-2.5-flash';
        $providers[] = array(
            'name' => 'Gemini',
            'type' => 'gemini',
            'url' => 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent',
            'key' => LP_GEMINI_API_KEY
        );
    }
    if (defined('LP_GROQ_API_KEY') && LP_GROQ_API_KEY !== '') {
        $providers[] = array(
            'name' => 'Groq',
            'type' => 'openai',
            'url' => 'https://api.groq.com/openai/v1/chat/completions',
            'key' => LP_GROQ_API_KEY,
            'model' => defined('LP_GROQ_MODEL') ? LP_GROQ_MODEL : 'llama-3.3-70b-versatile'
        );
    }
    if (defined('LP_OPENAI_API_KEY') && LP_OPENAI_API_KEY !== '') {
        $providers[] = array(
            'name' => 'OpenAI',
            'type' => 'openai',
            'url' => 'https://api.openai.com/v1/chat/completions',
            'key' => LP_OPENAI_API_KEY,
            'model' => defined('LP_OPENAI_MODEL') ? LP_OPENAI_MODEL : 'gpt-4o-mini'
        );
    }
    return $providers;
}

function lp_provider_request($provider, $messages, $maxTokens, $temperature)
{
    if ($provider['type'] === 'gemini') {
        $system = '';
        $contents = array();
        foreach ($messages as $message) {
            if ($message['role'] === 'system') {
                $system = $message['content'];
                continue;
            }
            $contents[] = array(
                'role' => $message['role'] === 'assistant' ? 'model' : 'user',
                'parts' => array(array('text' => $message['content']))
            );
        }
        $payload = array(
            'contents' => $contents,
            'generationConfig' => array(
                'temperature' => $temperature,
                'maxOutputTokens' => $maxTokens
            )
        );
        if ($system !== '') {
            $payload['systemInstruction'] = array('parts' => array(array('text' => $system)));
        }
        $headers = array('x-goog-api-key: ' . $provider['key'], 'Content-Type: application/json');
    } else {
        $payload = array(
            'model' => $provider['model'],
            'temperature' => $temperature,
            'max_tokens' => $maxTokens,
            'messages' => $messages
        );
        $headers = array('Authorization: Bearer ' . $provider['key'], 'Content-Type: application/json');
    }

    $response = lp_http_request($provider['url'], $headers, $payload);
    if ($response['status'] < 200 || $response['status'] >= 300) {
        error_log($provider['name'] . ' returned HTTP ' . $response['status'] . '.');
        return null;
    }

    $result = lp_decode_provider_response($response);
    if ($provider['type'] === 'gemini') {
        $parts = isset($result['candidates'][0]['content']['parts']) && is_array($result['candidates'][0]['content']['parts'])
            ? $result['candidates'][0]['content']['parts']
            : array();
        $content = '';
        foreach ($parts as $part) {
            if (isset($part['text']) && is_string($part['text'])) {
                $content .= $part['text'];
            }
        }
        return trim($content);
    }

    $content = isset($result['choices'][0]['message']['content']) ? $result['choices'][0]['message']['content'] : '';
    return is_string($content) ? trim($content) : '';
}

function lp_require_ai_provider()
{
    $providers = lp_ai_providers();
    if (!$providers) {
        lp_json_response(503, array('error' => 'Set a valid AI provider key in api/config.php.'));
    }
    return $providers;
}

function lp_validate_firebase_admin($token)
{
    if (!defined('LP_FIREBASE_API_KEY') || !defined('LP_FIREBASE_PROJECT_ID') ||
        LP_FIREBASE_API_KEY === '' || LP_FIREBASE_PROJECT_ID === '') {
        throw new RuntimeException('Firebase verification is not configured.');
    }

    $lookupUrl = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' . rawurlencode(LP_FIREBASE_API_KEY);
    $lookup = lp_http_request(
        $lookupUrl,
        array('Content-Type: application/json'),
        array('idToken' => $token),
        'POST',
        15
    );
    if ($lookup['status'] === 400 || $lookup['status'] === 401) {
        return false;
    }
    if ($lookup['status'] < 200 || $lookup['status'] >= 300) {
        throw new RuntimeException('Firebase identity lookup returned HTTP ' . $lookup['status'] . '.');
    }

    $identity = lp_decode_provider_response($lookup);
    $uid = isset($identity['users'][0]['localId']) ? $identity['users'][0]['localId'] : '';
    if ($uid === '') {
        return false;
    }

    $documentUrl = 'https://firestore.googleapis.com/v1/projects/' .
        rawurlencode(LP_FIREBASE_PROJECT_ID) .
        '/databases/(default)/documents/admins/' . rawurlencode($uid);
    $document = lp_http_request(
        $documentUrl,
        array('Authorization: Bearer ' . $token, 'Accept: application/json'),
        null,
        'GET',
        15
    );
    if ($document['status'] === 401 || $document['status'] === 403 || $document['status'] === 404) {
        return false;
    }
    if ($document['status'] < 200 || $document['status'] >= 300) {
        throw new RuntimeException('Firebase admin lookup returned HTTP ' . $document['status'] . '.');
    }

    $admin = lp_decode_provider_response($document);
    return isset($admin['fields']['role']['stringValue']) &&
        $admin['fields']['role']['stringValue'] === 'admin';
}

lp_load_config();
