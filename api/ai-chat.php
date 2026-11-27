<?php
require_once __DIR__ . '/_common.php';

lp_require_post();
$request = lp_read_json_body(20000);
$providers = lp_require_ai_provider();

$message = isset($request['message']) && is_string($request['message']) ? trim($request['message']) : '';
if ($message === '') {
    lp_json_response(400, array('error' => 'Please enter a message.'));
}
if (lp_text_length($message) > 500) {
    lp_json_response(413, array('error' => 'Message too long.'));
}

$history = array();
if (isset($request['history']) && is_array($request['history'])) {
    foreach (array_slice($request['history'], -10) as $item) {
        if (!is_array($item) || !isset($item['role'], $item['content']) ||
            !in_array($item['role'], array('user', 'assistant'), true) ||
            !is_string($item['content'])) {
            continue;
        }
        $content = trim($item['content']);
        if ($content !== '' && lp_text_length($content) <= 1500) {
            $history[] = array('role' => $item['role'], 'content' => $content);
        }
    }
}

$properties = isset($request['properties']) && is_array($request['properties'])
    ? array_slice($request['properties'], 0, 12)
    : array();
$projects = isset($request['projects']) && is_array($request['projects'])
    ? array_slice($request['projects'], 0, 12)
    : array();
$system = implode(' ', array(
    'You are a friendly, helpful, general-purpose conversational AI assistant for Land Pulse Marketing.',
    'You can discuss any topic and answer general questions; do not restrict the conversation to real estate.',
    "Reply naturally in the user's language and script, including Roman Urdu, Urdu, or simple English.",
    'For questions about Land Pulse Marketing properties, projects, prices, or availability, use only the supplied current inventory. Never invent property details, prices, approvals, or amenities.',
    'Be clear when you are uncertain or do not have current information.',
    'Keep answers warm, professional, useful, and concise for natural voice conversation. Use plain spoken sentences, avoid markdown, emoji, decorative symbols, and unnecessary numbers. Preserve important amounts and read them naturally.',
    'Current properties: ' . json_encode($properties, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    'Current projects: ' . json_encode($projects, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
));
$messages = array_merge(
    array(array('role' => 'system', 'content' => $system)),
    $history,
    array(array('role' => 'user', 'content' => $message))
);

foreach ($providers as $provider) {
    try {
        $content = lp_provider_request($provider, $messages, 350, 0.5);
        if (is_string($content) && $content !== '') {
            lp_json_response(200, array('content' => $content));
        }
    } catch (Throwable $error) {
        error_log($provider['name'] . ' chat request failed: ' . $error->getMessage());
    }
}

lp_json_response(502, array('error' => 'AI service abhi jawab generate nahi kar saki. API key aur PHP cURL configuration check karein.'));
