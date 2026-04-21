# pccx-lab: 궁극의 NPU 아키텍처 프로파일러 설계서

[Core Identity]

- 아키텍처: Tauri 2.0 (Rust) + React (TypeScript) + WebGL/WebGPU
- 핵심 가치: Zero-Lag, Apple-class Design, AI-Driven Analysis, Cycle-Accurate Verification
- 전용 포맷: .pccx v0.2 (메이저 0x01, 마이너 0x01 — 바이너리 컨테이너)
- 라이선스: 전체 저장소 Apache License 2.0 (`LICENSE` 참조)

[To-Do List]

Phase 1 ~ 5: 인프라 파이프라인 및 시각화 구축 (완료)
- [x] Shared Memory Bridge 및 .pccx 포맷 직렬화 시스템.
- [x] WebGL Instanced Renderer (1024개 MAC 어레이 렉 프리 드로우 로직).
- [x] Dual AI Pipeline, 엔터프라이즈 PDF 리포터, License Manager (Tauri IPC).

Phase 6: 시뮬레이션 엔진 정밀화 (Simulation Edge Cases) (완료)
- [x] 멀티코어 AXI 경합 모델 / SYSTOLIC_STALL / BARRIER_SYNC 이벤트.
- [x] UVM Bridge DPI-C 호환 모델 및 22개 테스트 스위트.

Phase 7: 상용 툴-급 UI/UX 대개편 (완료)
- [x] VS Code 급 다방향 패널 도킹 시스템 (Tear & Attach).
- [x] Drag & Drop 하드웨어 노드 에디터 도입 (Vivado IP Integrator 급).
- [x] SystemVerilog 하이라이트 + AI 인라인 생성기 + Vivado XSIM 터미널 연동 (`CodeEditor.tsx`).
- [x] VTune 급 AI 퍼포먼스 바틀넥 자동 스캐너 도입 (`FlameGraph.tsx`).

Phase 8: 통합 비즈니스 검증 생태계 (The Ultimate Verification Suite) (완료)
- [x] ISA 검증 대시보드 구조화: 어셈블러 명령어 단위 Cycle 정확도 디버깅 인프라.
- [x] API 검증 시스템: 런타임 드라이버 API 핑퐁 호출 및 응답 검증 환경.
- [x] UVM Coverage & Visualizer 통합: 트랜잭션, 분기 커버리지 시각화를 위한 킬러급 GUI.
- [x] 메가 메뉴 및 모던 상단 네비게이션(NVIDIA/Intel Nsight 스타일의 상판 도입).

Phase 9: 미래 최적화 및 외부 확장 (완료)
- [x] WebGPU Compute Shader 개념 도입 및 시각적 파이프라인(CanvasView) 통합 분석.
- [x] .pccx → .vcd (GTKWave/Verdi) 내보내기 로직(다이얼로그 메시지) 구현 완료.
- [x] 퍼포먼스 Roofline 모델 라이브 렌더링 (`Roofline.tsx` 및 ECharts 연동).

Phase 10: pccx-FPGA Verification Bridge (2026-04-20 완료)
- [x] `hw/sim/run_verification.sh` glob 기반 러너 — testbench 추가 시 두 줄만
      (`TB_DEPS` / `TB_CORE`) 업데이트하면 자동 픽업.
- [x] `pccx-core/src/bin/from_xsim_log.rs` — xsim stdout (PASS/FAIL 라인)
      을 `.pccx` 트레이스로 변환하는 브릿지 바이너리.
- [x] Verification → Synth Status 서브탭의 4-card 대시보드:
      `VerificationRunner`, `SynthStatusCard`, `RooflineCard`,
      `BottleneckCard` — 모두 `trace-loaded` 이벤트 구독으로 자동 리프레시.
- [x] Tauri IPC 17 개 — `run_verification`, `load_synth_report`,
      `analyze_roofline`, `detect_bottlenecks`, `generate_markdown_report`,
      `list_pccx_traces`, `list_uvm_strategies` 추가.
- [x] pccx-FPGA RTL 검증 6 tb / 1930 cycles PASS 확정.

Phase 11: Blender-grade Node Editor + Strengthened Reports (2026-04-20 진행 중)
- [x] 노드 팔레트 카테고리화 (Input / Memory / Compute / Output) + 라이브 검색.
- [x] Shift+A quick-add 메뉴 — 커서 위치 기준 플로팅 오버레이.
- [x] pccx v002 전용 5 노드 추가: GEMV, CVO SFU, HP Buffer, URAM L2, fmap Cache.
- [x] UVM 전략 카탈로그 5 종 + `list_uvm_strategies` IPC.
- [x] Markdown 리포트 생성기 (`pccx_core::report::render_markdown`) + IPC.
- [ ] Frame / Node group (Blender-grade nested grouping).
- [ ] Typed socket 검증 — 연결 시도 시 부적합한 타입 차단 + 힌트.
- [ ] SVG / PNG topology 내보내기.
- [ ] PDF 리포트 렌더링 (현재 Markdown 전용).
- [ ] Vivado post-implementation 리포트 (`timing_summary_post_impl.rpt`)
      파싱 + `SynthStatusCard` 에 `impl` / `synth` 스위치.

Phase 12: pccx-FPGA V002 Coverage Push (다음 세션 대상)
- [ ] `vec_core_pkg` + `dtype_pkg` 선행 컴파일 + UNISIM 로드로 VEC_CORE
      테스트벤치 (`GEMV_reduction`, `GEMV_accumulate`) 추가.
- [ ] XPM 메모리 매크로 지원 — `fmap_cache.sv` 테스트벤치.
- [ ] `tb_GEMM_fmap_staggered_delay` 재도전 — xsim 에서 관찰된 col≥1 의
      "same-iter drive가 row_data 에 즉시 반영되는" 타이밍 패턴 재현.
- [ ] NPU_Controller 통합 테스트 (`ctrl_npu_decoder` + `Global_Scheduler`).

Phase 13: Scenario-Grade Visualisation + Testbench Authoring (2026-04-20 진행)
- [x] `ScenarioFlow.tsx` — Gemma 3N E4B 디코드 스텝의 계층적 드릴다운
      (decode_step → attn / ffn / lm_head → sub-stages). 블록 클릭 시
      math 수식 + ISA opcode 시퀀스 (cycle-accurate, unit-별 색상 bar)
      + Data Movement 다이어그램 (source→sink byte/cycle bar, 레이턴시
      비례 빨-주-노-파 그라디언트).
- [x] `TestbenchAuthor.tsx` — ISA / API / SV 3-뷰 편집기.
      ISA 테이블이 authoritative 소스, API (C uca_*) 와 SV 테스트벤치
      스켈레톤 (canonical `PASS:` 마커 포함) 자동 생성.
      Copy / Download 버튼으로 바로 `hw/sim/run_verification.sh` 투입.
- [x] `BottomPanel.tsx` — Log / Console / Live Telemetry 3-탭 하단
      도킹. REPL 콘솔 (help / run_verification / analyze_roofline / …).
      Live Telemetry 가 기본 탭.
- [x] `FlameGraph` 121-span Gemma 3N 디코드 + **click-to-isolate**
      (선택 span + 조상/자손만 색, 나머지는 55% 회색 dim) + vertical
      stretch to fill canvas.
- [x] i18n (`i18n.tsx`) — EN/KO 딕셔너리 + localStorage 영속. 기본 EN,
      `navigator.language === "ko*"` 최초 로드 시에만 KO 기본값.
- [x] Community / Enterprise 브랜딩 삭제 (License 뱃지, 메뉴,
      ReportGenerator 제목, AI Copilot 시스템 프롬프트).

[Future]

- [ ] **전용 AI 모델 연결** — pccx-lab 자체 호스팅 LLM (vLLM 또는 llama.cpp
      sidecar) + AI Copilot 패널이 Tauri IPC 로 연결. 수익 구조는 추후
      결정. 현재 OpenAI 사용자 토큰 입력 경로는 유지.

Phase 14: UI 품질 패스 (2026-04-20 feedback batch)
- [x] 우측 AI Copilot 패널: `minSize 20→16 %` / `maxSize 50→70 %` /
      `minWidth 280→240 px` — 이전의 "줄이기만 되고 다시 늘릴 수 없음"
      버그 해소.
- [x] AI Copilot placeholder / hint / system 메시지 i18n 반영 — EN
      모드에서도 한국어가 섞이는 문제 해소.
- [x] Light mode 텍스트 가독성: `VerificationSuite` 의 `bg-black/20`,
      `text-gray-*`, `hover:bg-white/5` 등 Tailwind 다크 전용 유틸리티
      제거 → theme 토큰 사용. `MemoryDump` hover 색 동일 처리.
- [ ] 상단 툴바/탭바 접기(collapse) 토글 — 아직 남음.
- [ ] Waveform 드래그/선택/multi-radix(bin/oct/hex/dec)/배열/시그널 필터 — Vivado 급 업그레이드 필요.
- [ ] Memory Dump 타임라인 + Visual Studio 급 시각화.
- [ ] System Simulator: KV260 실 RTL 기반 강화.
- [ ] Report: PDF 스타일 확장 + 표 추가 + methodology/glossary 섹션.
- [ ] Verification / Roofline 콘텐츠 추가 심화.
- [ ] TB Author GUI 위주로 추가 — 현재는 코드 편집 중심.
