# pccx-lab: 궁극의 NPU 아키텍처 프로파일러 설계서

[Core Identity]

- 아키텍처: Tauri 2.0 (Rust) + React (TypeScript) + WebGL/WebGPU
- 핵심 가치: Zero-Lag, Apple-class Design, AI-Driven Analysis, Enterprise Verification
- 전용 포맷: .pccx v0.2 (메이저 0x01, 마이너 0x01 — 바이너리 컨테이너)

[Open Core Strategy & Licensing]

Open Source (Apache 2.0 License):
- 저장소: GitHub Public Repository (hwkim-dev/pccx-lab)
- `ui/` 프론트엔드 쉘 및 기본 시각화 컴포넌트.
- `.pccx` 포맷 파서 및 데이터 규격 명세 (v0.2 — 메이저/마이너 분리, 체크섬 지원).
- 플러그인 인터페이스 및 커뮤니티용 기본 노드 세트.
- `uvm_bridge/` DPI-C export 레이어.

Closed Source (Proprietary License):
- 저장소: GitHub Private Repository (hwkim-dev/pccx-core-private 등)
- `core/` 내 고속 시뮬레이션 및 사이클 예측 엔진.
- Zero-Copy 메모리 브릿지 최적화 로직.
- 온디바이스 로컬 AI 분석 모듈 및 엔터프라이즈 보고서 생성기.

결합 방식: Rust Cargo의 Private Git Dependency 및 Feature Flags를 활용하여, 권한이 있는 빌드 환경에서만 엔터프라이즈 코어가 주입되도록 설계.

[To-Do List]

Phase 1 ~ 5: 인프라 파이프라인 및 시각화 구축 (완료)
- [x] Shared Memory Bridge 및 .pccx 포맷 직렬화 시스템.
- [x] WebGL Instanced Renderer (1024개 MAC 어레이 렉 프리 드로우 로직).
- [x] Dual AI Pipeline, 엔터프라이즈 PDF 리포터, License Manager (Tauri IPC).

Phase 6: 시뮬레이션 엔진 정밀화 (Simulation Edge Cases) (완료)
- [x] 멀티코어 AXI 경합 모델 / SYSTOLIC_STALL / BARRIER_SYNC 이벤트.
- [x] UVM Bridge DPI-C 호환 모델 및 22개 테스트 스위트.

Phase 7: 엔터프라이즈급 UI/UX 대개편 (The Commercial Edition) (완료)
- [x] VS Code 급 다방향 패널 도킹 시스템 (Tear & Attach).
- [x] Drag & Drop 하드웨어 노드 에디터 도입 (Vivado IP Integrator 급).
- [x] SystemVerilog 하이라이트 + AI 인라인 생성기 + Vivado XSIM 터미널 연동 (`CodeEditor.tsx`).
- [x] VTune 급 AI 퍼포먼스 바틀넥 자동 스캐너 도입 (`FlameGraph.tsx`).

Phase 8: 통합 비즈니스 검증 생태계 (The Ultimate Verification Suite) (완료)
- [x] ISA 검증 대시보드 구조화: 어셈블러 명령어 단위 Cycle 정확도 디버깅 인프라.
- [x] API 검증 시스템: 런타임 드라이버 API 핑퐁 호출 및 응답 검증 환경.
- [x] UVM Coverage & Visualizer 통합: 트랜잭션, 분기 커버리지 시각화를 위한 킬러급 GUI.
- [x] 메가 메뉴 및 모던 Enterprise UI 네비게이션(NVIDIA/Intel 스타일의 상판 도입).

Phase 9: 미래 최적화 및 외부 확장 (완료)
- [x] WebGPU Compute Shader 개념 도입 및 시각적 파이프라인(CanvasView) 통합 분석.
- [x] .pccx → .vcd (GTKWave/Verdi) 내보내기 로직(다이얼로그 메시지) 구현 완료.
- [x] 퍼포먼스 Roofline 모델 라이브 렌더링 (`Roofline.tsx` 및 ECharts 연동).
