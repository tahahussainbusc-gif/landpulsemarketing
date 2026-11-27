<?php
require_once __DIR__ . '/_common.php';

lp_require_post();
$authorization = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
if (!preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
    lp_json_response(401, array('error' => 'Sign in to the CMS before generating content.'));
}

try {
    if (!lp_validate_firebase_admin(trim($matches[1]))) {
        lp_json_response(401, array('error' => 'Only signed-in CMS admins can generate content.'));
    }
} catch (Throwable $error) {
    error_log('Could not verify CMS admin: ' . $error->getMessage());
    lp_json_response(503, array('error' => 'Could not verify your CMS session. Please sign in again and retry.'));
}

$request = lp_read_json_body(12000);
if (!isset($request['type'], $request['field'], $request['data']) ||
    !in_array($request['type'], array('property', 'project'), true) ||
    !in_array($request['field'], array('title', 'description'), true) ||
    !is_array($request['data'])) {
    lp_json_response(400, array('error' => 'Choose a valid project or property title/description to generate.'));
}
$providers = lp_require_ai_provider();

$allowedKeys = array(
    'title', 'description', 'location', 'priceRange', 'badge', 'category',
    'size', 'listingType', 'price', 'beds', 'baths', 'projectTitle', 'instruction'
);
$details = array();
foreach ($allowedKeys as $key) {
    if (!array_key_exists($key, $request['data']) || $request['data'][$key] === null || $request['data'][$key] === '') {
        continue;
    }
    if (!is_string($request['data'][$key]) && !is_int($request['data'][$key]) && !is_float($request['data'][$key])) {
        lp_json_response(400, array('error' => 'The ' . $key . ' value must be text.'));
    }
    $value = trim((string) $request['data'][$key]);
    if (lp_text_length($value) > 1000) {
        lp_json_response(400, array('error' => 'The ' . $key . ' value is too long.'));
    }
    $details[$key] = $value;
}

$type = $request['type'];
$field = $request['field'];
$isTownProject = $type === 'project' &&
    preg_match('/\btown\b/i', (isset($details['title']) ? $details['title'] : '') . ' ' . (isset($details['location']) ? $details['location'] : ''));
$instruction = $field === 'title'
    ? 'Write one clear, appealing ' . $type . ' title in at most 12 words.'
    : 'Write a concise, polished ' . $type . ' description in 2-4 sentences.';
$adminInstruction = !empty($details['instruction']) ? ' Admin instruction: ' . $details['instruction'] : '';
$system = implode(' ', array_filter(array(
    'You write accurate real-estate listing copy.',
    'Use only facts present in the supplied JSON. Never invent amenities, approvals, returns, availability, measurements, or legal claims.',
    'Do not include a price unless the supplied details contain one.',
    $isTownProject ? 'This is a Town project: do not mention or suggest any price.' : '',
    'Return only the requested text, without quotes or markdown.'
)));
$user = $instruction . $adminInstruction . "\nDetails: " .
    json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$messages = array(
    array('role' => 'system', 'content' => $system),
    array('role' => 'user', 'content' => $user)
);

foreach ($providers as $provider) {
    try {
        $content = lp_provider_request($provider, $messages, $field === 'title' ? 80 : 300, 0.6);
        if (is_string($content) && $content !== '') {
            lp_json_response(200, array('content' => $content));
        }
    } catch (Throwable $error) {
        error_log($provider['name'] . ' content generation failed: ' . $error->getMessage());
    }
}

lp_json_response(502, array('error' => 'The AI service could not generate content. Please check its configuration and retry.'));
