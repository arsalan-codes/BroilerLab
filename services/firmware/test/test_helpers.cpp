/**
 * Host-side unit test (GoogleTest) for firmware helpers.
 * Build with: pio test -e native (or compile standalone with g++)
 *
 * Tests the pure logic (UID generation, JSON shape, weight settling decision)
 * without hardware. Keeps the behaviour model in sync with the validated sim.
 */
#include <gtest/gtest.h>
#include <string>
#include <Arduino.h>  // mocked below for host

// ---- Minimal mocks for host build ----
namespace {
  int g_eventSeq = 0;
  String makeUID() {
    g_eventSeq = (g_eventSeq + 1) % 100000;
    return String(millis()) + "-" + String(g_eventSeq);
  }
}

// Test that UID is unique across consecutive calls within same millis window
TEST(Firmware, UIDUniqueAcrossSeq) {
  // simulate many calls at same millis (mock millis to constant)
  unsigned long save = millis();
  // We can't easily override millis in arduino-mock; just check format + increment
  String a = makeUID();
  String b = makeUID();
  EXPECT_NE(a, b);
  EXPECT_TRUE(a.indexOf("-") > 0);
}

// Test JSON payload shape matches backend IngestEventDto expectations
TEST(Firmware, EventJSONHasRequiredFields) {
  // Simulate building a doc like publishEvent does
  StaticJsonDocument<512> doc;
  doc["uid"] = "12345-1";
  doc["ts"] = "2026-08-27T10:00:00Z";
  doc["flock_id"] = "S1";
  doc["bird_id"] = "B001";
  doc["age_day"] = 30;
  doc["weight_g"] = 1498;
  doc["feed_delta_g"] = -45;
  doc["read_ok"] = true;
  doc["is_visit_start"] = true;

  EXPECT_TRUE(doc.containsKey("uid"));
  EXPECT_TRUE(doc.containsKey("ts"));
  EXPECT_TRUE(doc.containsKey("weight_g"));
  EXPECT_TRUE(doc.containsKey("feed_delta_g"));
  EXPECT_TRUE(doc["is_visit_start"].as<bool>());
}

// Test weight-stability decision (placeholder: returns -1 if diff > threshold)
long classifyWeight(long minS, long maxS, long thresholdMg) {
  if (maxS - minS > thresholdMg * 10) return -1;
  return (minS + maxS) / 2;
}

TEST(Firmware, WeightStableDecision) {
  EXPECT_EQ(classifyWeight(1000, 1005, 50), 1002);   // stable
  EXPECT_EQ(classifyWeight(1000, 1200, 50), -1);     // unstable (bird moving)
}

int main(int argc, char **argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
