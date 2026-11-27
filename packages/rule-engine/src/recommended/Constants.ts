const constants = {
  // Platform 3.0 does not have account_id in the payload. A numerical ID is required in the email payload for freshdesk mail service when sending to gmail. 25196 is Advanced automation app ID.
  DEFAULT_ACCOUNT_ID: 25196,
  MAX_MESSAGES_TRANSCRIPT: 500,
  MAX_MESSAGES_TRANSCRIPT_STATIC_IP: 50,
};

export default constants;
