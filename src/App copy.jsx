import { useEffect, useState } from "react";
import "./App.css";

const INITIAL_MARKERS = [];

/*
================================
이미지 압축
================================
*/

const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 1600;

        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(
            MAX_WIDTH / width,
            MAX_HEIGHT / height
          );

          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Canvas를 생성할 수 없습니다."));
          return;
        }

        ctx.drawImage(
          img,
          0,
          0,
          width,
          height
        );

        const compressed = canvas.toDataURL(
          "image/jpeg",
          0.7
        );

        resolve(compressed);
      };

      img.onerror = () => {
        reject(new Error("이미지를 불러올 수 없습니다."));
      };

      img.src = event.target.result;
    };

    reader.onerror = () => {
      reject(new Error("파일을 읽을 수 없습니다."));
    };

    reader.readAsDataURL(file);
  });
};

/*
================================
App
================================
*/

function App() {
  const [scale, setScale] = useState(1);

  const [position, setPosition] = useState({
    x: 0,
    y: 0,
  });

  /*
  ================================
  마커 불러오기
  ================================
  */

  const [markers, setMarkers] = useState(() => {
    try {
      const saved = localStorage.getItem(
        "kurur-markers"
      );

      if (!saved) {
        return INITIAL_MARKERS;
      }

      const parsed = JSON.parse(saved);

      if (!Array.isArray(parsed)) {
        return INITIAL_MARKERS;
      }

      return parsed;
    } catch (error) {
      console.error(
        "마커 데이터를 불러오는 중 오류:",
        error
      );

      return INITIAL_MARKERS;
    }
  });

  const [selectedMarker, setSelectedMarker] =
    useState(null);

  const [search, setSearch] = useState("");

  const [activeFilter, setActiveFilter] =
    useState("all");

  const [
    editingDescription,
    setEditingDescription,
  ] = useState("");

  const [
    editingLocationImage,
    setEditingLocationImage,
  ] = useState("");

  const [
    editingMapImage,
    setEditingMapImage,
  ] = useState("");

  const [isAddingMarker, setIsAddingMarker] =
    useState(false);

  const [pasteTarget, setPasteTarget] =
    useState(null);

  const [toast, setToast] = useState("");

  const [largeImage, setLargeImage] =
    useState(null);

  const [dragging, setDragging] =
    useState(false);

  const [dragStart, setDragStart] = useState({
    x: 0,
    y: 0,
  });

  const [startPosition, setStartPosition] =
    useState({
      x: 0,
      y: 0,
    });

  const [didDrag, setDidDrag] =
    useState(false);

  /*
  ================================
  마커 저장
  ================================
  */

  useEffect(() => {
    try {
      localStorage.setItem(
        "kurur-markers",
        JSON.stringify(markers)
      );
    } catch (error) {
      console.error(
        "마커 저장 실패:",
        error
      );

      showToast(
        "저장 공간이 부족합니다. 사진을 줄여주세요."
      );
    }
  }, [markers]);

  /*
  ================================
  토스트
  ================================
  */

  const showToast = (message) => {
    setToast(message);

    setTimeout(() => {
      setToast("");
    }, 2200);
  };

  /*
  ================================
  Ctrl + V 사진 붙여넣기
  ================================
  */

  useEffect(() => {
    const handlePaste = async (event) => {
      if (!pasteTarget) {
        return;
      }

      const items =
        event.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (
          item.type &&
          item.type.startsWith("image/")
        ) {
          const file = item.getAsFile();

          if (!file) {
            showToast(
              "사진을 읽을 수 없습니다."
            );
            return;
          }

          event.preventDefault();

          try {
            showToast(
              "사진을 처리하고 있습니다..."
            );

            const compressedImage =
              await compressImage(file);

            if (
              pasteTarget ===
              "location"
            ) {
              setEditingLocationImage(
                compressedImage
              );
            }

            if (
              pasteTarget === "map"
            ) {
              setEditingMapImage(
                compressedImage
              );
            }

            showToast(
              pasteTarget ===
                "location"
                ? "위치사진이 추가되었습니다."
                : "지도사진이 추가되었습니다."
            );

            setPasteTarget(null);
          } catch (error) {
            console.error(
              "사진 처리 오류:",
              error
            );

            showToast(
              "사진 처리 중 오류가 발생했습니다."
            );
          }

          return;
        }
      }

      showToast(
        "클립보드에 이미지가 없습니다."
      );
    };

    window.addEventListener(
      "paste",
      handlePaste
    );

    return () => {
      window.removeEventListener(
        "paste",
        handlePaste
      );
    };
  }, [pasteTarget]);

  /*
  ================================
  ESC
  ================================
  */

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setLargeImage(null);
        setPasteTarget(null);
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, []);

  /*
  ================================
  마커 열기
  ================================
  */

  const openMarker = (marker) => {
    setSelectedMarker(marker);

    setEditingDescription(
      marker.description || ""
    );

    setEditingLocationImage(
      marker.locationImage || ""
    );

    setEditingMapImage(
      marker.mapImage || ""
    );

    setPasteTarget(null);

    setIsAddingMarker(false);
  };

  /*
  ================================
  위치 추가 시작
  ================================
  */

  const startAddMarker = () => {
    setSelectedMarker(null);

    setIsAddingMarker(true);

    showToast(
      "지도에서 원하는 위치를 클릭하세요."
    );
  };

  /*
  ================================
  새 위치 생성
  ================================
  */

  const handleMapClick = (event) => {
    if (!isAddingMarker) {
      return;
    }

    if (didDrag) {
      return;
    }

    const rect =
      event.currentTarget.getBoundingClientRect();

    const x =
      ((event.clientX - rect.left) /
        rect.width) *
      100;

    const y =
      ((event.clientY - rect.top) /
        rect.height) *
      100;

    const maxId =
      markers.length > 0
        ? Math.max(
            ...markers.map(
              (marker) =>
                Number(marker.id) || 0
            )
          )
        : 0;

    const newMarker = {
      id: maxId + 1,
      x,
      y,
      description: "",
      locationImage: "",
      mapImage: "",
      discovered: false,
    };

    setMarkers((prev) => [
      ...prev,
      newMarker,
    ]);

    setSelectedMarker(newMarker);

    setEditingDescription("");

    setEditingLocationImage("");

    setEditingMapImage("");

    setIsAddingMarker(false);

    showToast(
      `#${String(
        newMarker.id
      ).padStart(
        3,
        "0"
      )} 위치가 추가되었습니다.`
    );
  };

  /*
  ================================
  마커 저장
  ================================
  */

  const saveMarker = () => {
    if (!selectedMarker) {
      return;
    }

    const updatedMarker = {
      ...selectedMarker,

      description:
        editingDescription,

      locationImage:
        editingLocationImage,

      mapImage:
        editingMapImage,
    };

    setMarkers((prev) =>
      prev.map((marker) =>
        marker.id ===
        selectedMarker.id
          ? updatedMarker
          : marker
      )
    );

    setSelectedMarker(
      updatedMarker
    );

    showToast(
      "저장되었습니다."
    );
  };

  /*
  ================================
  발견
  ================================
  */

  const toggleDiscovered = () => {
    if (!selectedMarker) {
      return;
    }

    const updated = {
      ...selectedMarker,

      discovered:
        !selectedMarker.discovered,
    };

    setMarkers((prev) =>
      prev.map((marker) =>
        marker.id === updated.id
          ? updated
          : marker
      )
    );

    setSelectedMarker(updated);
  };

  /*
  ================================
  삭제
  ================================
  */

  const deleteMarker = () => {
    if (!selectedMarker) {
      return;
    }

    const confirmed =
      window.confirm(
        `#${String(
          selectedMarker.id
        ).padStart(
          3,
          "0"
        )} 위치를 삭제할까요?`
      );

    if (!confirmed) {
      return;
    }

    setMarkers((prev) =>
      prev.filter(
        (marker) =>
          marker.id !==
          selectedMarker.id
      )
    );

    setSelectedMarker(null);

    showToast(
      "위치가 삭제되었습니다."
    );
  };

  /*
  ================================
  확대 / 축소
  ================================
  */

  const zoomIn = () => {
    setScale((prev) =>
      Math.min(
        prev + 0.2,
        5
      )
    );
  };

  const zoomOut = () => {
    setScale((prev) =>
      Math.max(
        prev - 0.2,
        0.5
      )
    );
  };

  const resetMap = () => {
    setScale(1);

    setPosition({
      x: 0,
      y: 0,
    });
  };

  /*
  ================================
  휠 확대
  ================================
  */

  const handleWheel = (event) => {
    event.preventDefault();

    if (event.deltaY < 0) {
      setScale((prev) =>
        Math.min(
          prev + 0.15,
          5
        )
      );
    } else {
      setScale((prev) =>
        Math.max(
          prev - 0.15,
          0.5
        )
      );
    }
  };

  /*
  ================================
  지도 드래그
  ================================
  */

  const handleMouseDown = (
    event
  ) => {
    if (event.button !== 0) {
      return;
    }

    setDragging(true);

    setDidDrag(false);

    setDragStart({
      x: event.clientX,
      y: event.clientY,
    });

    setStartPosition({
      x: position.x,
      y: position.y,
    });
  };

  const handleMouseMove = (
    event
  ) => {
    if (!dragging) {
      return;
    }

    const dx =
      event.clientX -
      dragStart.x;

    const dy =
      event.clientY -
      dragStart.y;

    if (
      Math.abs(dx) > 4 ||
      Math.abs(dy) > 4
    ) {
      setDidDrag(true);
    }

    setPosition({
      x:
        startPosition.x +
        dx,

      y:
        startPosition.y +
        dy,
    });
  };

  const stopDragging = () => {
    setDragging(false);
  };

  /*
  ================================
  필터
  ================================
  */

  const discoveredCount =
    markers.filter(
      (marker) =>
        marker.discovered
    ).length;

  const photoCount =
    markers.filter(
      (marker) =>
        marker.locationImage ||
        marker.mapImage
    ).length;

  const filteredMarkers =
    markers.filter(
      (marker) => {
        const text =
          search
            .trim()
            .toLowerCase();

        const number =
          String(
            marker.id
          ).padStart(
            3,
            "0"
          );

        const matchesSearch =
          !text ||
          number.includes(
            text
          ) ||
          String(
            marker.id
          ).includes(text) ||
          (
            marker.description ||
            ""
          )
            .toLowerCase()
            .includes(text);

        let matchesFilter =
          true;

        if (
          activeFilter ===
          "discovered"
        ) {
          matchesFilter =
            marker.discovered;
        }

        if (
          activeFilter ===
          "undiscovered"
        ) {
          matchesFilter =
            !marker.discovered;
        }

        if (
          activeFilter ===
          "photo"
        ) {
          matchesFilter =
            Boolean(
              marker.locationImage ||
              marker.mapImage
            );
        }

        if (
          activeFilter ===
          "hide-discovered"
        ) {
          matchesFilter =
            !marker.discovered;
        }

        return (
          matchesSearch &&
          matchesFilter
        );
      }
    );

  /*
  ================================
  사진 삭제
  ================================
  */

  const removeLocationImage =
    () => {
      setEditingLocationImage(
        ""
      );
    };

  const removeMapImage = () => {
    setEditingMapImage("");
  };

  /*
  ================================
  사진 영역
  ================================
  */

  const PhotoBox = ({
    title,
    image,
    onPaste,
    onRemove,
  }) => {
    return (
      <div className="photo-section">

        <div className="photo-title">
          {title}
        </div>

        {image ? (
          <div className="photo-preview">

            <img
              src={image}
              alt={title}
              onClick={() =>
                setLargeImage(
                  image
                )
              }
            />

            <div className="photo-bottom">

              <button
                onClick={() =>
                  setLargeImage(
                    image
                  )
                }
              >
                🔍 크게 보기
              </button>

              <button
                onClick={
                  onRemove
                }
              >
                삭제
              </button>

            </div>

          </div>
        ) : (
          <button
            className="paste-area"
            onClick={() =>
              onPaste()
            }
          >

            <div className="paste-icon">
              📋
            </div>

            <strong>
              Ctrl + V
            </strong>

            <span>
              사진 붙여넣기
            </span>

            <small>
              먼저 이곳을 클릭한 뒤
              사진을 붙여넣으세요.
            </small>

          </button>
        )}

      </div>
    );
  };

  /*
  ================================
  화면
  ================================
  */

  return (
    <div className="app">

      <header className="topbar">

        <div className="title">
          🍯 꾸르르 찾기 지도
        </div>

        <div className="search-box">

          <span>
            🔎
          </span>

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="번호 또는 설명 검색..."
          />

          {search && (
            <button
              onClick={() =>
                setSearch("")
              }
            >
              ×
            </button>
          )}

        </div>

        <div className="zoom-buttons">

          <button
            onClick={zoomOut}
          >
            −
          </button>

          <button
            onClick={resetMap}
          >
            {Math.round(
              scale * 100
            )}
            %
          </button>

          <button
            onClick={zoomIn}
          >
            ＋
          </button>

        </div>

      </header>

      <div className="main">

        <aside className="sidebar">

          <h2>
            🍯 꾸르르
          </h2>

          <div className="progress-box">

            <div className="progress-title">
              발견 현황
            </div>

            <div className="progress-number">
              {discoveredCount} / 150
            </div>

            <div className="progress-bar">

              <div
                className="progress-fill"
                style={{
                  width: `${
                    Math.min(
                      discoveredCount /
                        150 *
                        100,
                      100
                    )
                  }%`,
                }}
              />

            </div>

            <div className="progress-percent">
              {Math.round(
                discoveredCount /
                  150 *
                  100
              )}
              %
            </div>

          </div>

          <div className="section-title">
            필터
          </div>

          <button
            className={`filter ${
              activeFilter ===
              "all"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveFilter(
                "all"
              )
            }
          >
            <span>
              전체
            </span>

            <span>
              {markers.length}
            </span>
          </button>

          <button
            className={`filter ${
              activeFilter ===
              "undiscovered"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveFilter(
                "undiscovered"
              )
            }
          >
            <span>
              미발견
            </span>

            <span>
              {
                markers.filter(
                  (m) =>
                    !m.discovered
                ).length
              }
            </span>
          </button>

          <button
            className={`filter ${
              activeFilter ===
              "discovered"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveFilter(
                "discovered"
              )
            }
          >
            <span>
              발견함
            </span>

            <span>
              {discoveredCount}
            </span>
          </button>

          <button
            className={`filter ${
              activeFilter ===
              "photo"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveFilter(
                "photo"
              )
            }
          >
            <span>
              📷 사진 있음
            </span>

            <span>
              {photoCount}
            </span>
          </button>

          <button
            className={`filter ${
              activeFilter ===
              "hide-discovered"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveFilter(
                "hide-discovered"
              )
            }
          >
            <span>
              👁️ 발견한 위치 숨기기
            </span>
          </button>

          <div className="section-title location-heading">
            위치 목록
          </div>

          <div className="locations">

            {filteredMarkers.map(
              (marker) => (
                <button
                  key={marker.id}
                  className={`location ${
                    selectedMarker?.id ===
                    marker.id
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    openMarker(
                      marker
                    )
                  }
                >

                  <div className="location-main">

                    <span>
                      {marker.discovered
                        ? "✅"
                        : "🍯"}
                    </span>

                    <b>
                      #
                      {String(
                        marker.id
                      ).padStart(
                        3,
                        "0"
                      )}
                    </b>

                  </div>

                  <small>
                    {marker.locationImage ||
                    marker.mapImage
                      ? "📷 사진 있음"
                      : "사진 없음"}

                    {" · "}

                    {marker.description
                      ? "설명 있음"
                      : "설명 없음"}
                  </small>

                </button>
              )
            )}

            {filteredMarkers.length ===
              0 && (
                <div className="empty-list">
                  위치가 없습니다.
                </div>
              )}

          </div>

        </aside>

        <main className="map-area">

          <div
            className={`map-wrapper ${
              isAddingMarker
                ? "adding-mode"
                : ""
            }`}
            onWheel={
              handleWheel
            }
            onMouseDown={
              handleMouseDown
            }
            onMouseMove={
              handleMouseMove
            }
            onMouseUp={
              stopDragging
            }
            onMouseLeave={
              stopDragging
            }
            onClick={
              handleMapClick
            }
          >

            <div
              className="map-content"
              style={{
                transform: `
                  translate(
                    ${position.x}px,
                    ${position.y}px
                  )
                  scale(${scale})
                `,
              }}
            >

              <img
                src="/map.jpg"
                alt="GTA V Map"
                className="map-image"
                draggable="false"
              />

              {filteredMarkers.map(
                (marker) => (

                  <button
                    key={marker.id}
                    className={`marker ${
                      marker.discovered
                        ? "discovered"
                        : ""
                    }`}
                    style={{
                      left: `${marker.x}%`,
                      top: `${marker.y}%`,
                    }}
                    onMouseDown={(
                      event
                    ) =>
                      event.stopPropagation()
                    }
                    onClick={(
                      event
                    ) => {
                      event.stopPropagation();

                      if (didDrag) {
                        return;
                      }

                      openMarker(
                        marker
                      );
                    }}
                  >

                    <span className="marker-dot">
                      {marker.discovered
                        ? "✓"
                        : ""}
                    </span>

                    <span className="marker-number">
                      #
                      {String(
                        marker.id
                      ).padStart(
                        3,
                        "0"
                      )}
                    </span>

                  </button>

                )
              )}

            </div>

          </div>

          {isAddingMarker && (
            <div className="adding-banner">

              📍 원하는 위치를
              클릭하세요.

              <button
                onClick={() =>
                  setIsAddingMarker(
                    false
                  )
                }
              >
                취소
              </button>

            </div>
          )}

          {toast && (
            <div className="toast">
              {toast}
            </div>
          )}

          <div className="map-help">

            🖱️ 휠
            <span>
              확대 / 축소
            </span>

            <br />

            🖐️ 드래그
            <span>
              지도 이동
            </span>

            <br />

            📷 사진
            <span>
              클릭 → 크게 보기
            </span>

          </div>

          <button
            className="add-button"
            onClick={
              startAddMarker
            }
          >
            ＋ 위치 추가
          </button>

          {selectedMarker && (

            <div
              className="marker-info"
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
              onClick={(event) =>
                event.stopPropagation()
              }
            >

              <div className="marker-info-header">

                <div>

                  <div className="marker-label">
                    꾸르르 위치
                  </div>

                  <h3>
                    🍯 #
                    {String(
                      selectedMarker.id
                    ).padStart(
                      3,
                      "0"
                    )}
                  </h3>

                </div>

                <button
                  className="close-button"
                  onClick={() =>
                    setSelectedMarker(
                      null
                    )
                  }
                >
                  ×
                </button>

              </div>

              <PhotoBox
                title="📷 위치사진"
                image={
                  editingLocationImage
                }
                onPaste={() =>
                  setPasteTarget(
                    "location"
                  )
                }
                onRemove={
                  removeLocationImage
                }
              />

              <PhotoBox
                title="🗺️ 지도사진"
                image={
                  editingMapImage
                }
                onPaste={() =>
                  setPasteTarget(
                    "map"
                  )
                }
                onRemove={
                  removeMapImage
                }
              />

              {pasteTarget && (
                <div className="paste-active">

                  📋 이제
                  <b>
                    Ctrl + V
                  </b>
                  를 눌러 사진을
                  붙여넣으세요.

                  <button
                    onClick={() =>
                      setPasteTarget(
                        null
                      )
                    }
                  >
                    취소
                  </button>

                </div>
              )}

              <div className="form-section">

                <label>
                  📝 위치 설명
                </label>

                <textarea
                  value={
                    editingDescription
                  }
                  onChange={(
                    event
                  ) =>
                    setEditingDescription(
                      event.target.value
                    )
                  }
                  placeholder={
                    "예: 건물 뒤쪽 골목입니다.\n나무 옆에 벌꿀집이 있습니다."
                  }
                />

              </div>

              <div className="info-row">

                <span>
                  위치 번호
                </span>

                <b>
                  #
                  {String(
                    selectedMarker.id
                  ).padStart(
                    3,
                    "0"
                  )}
                </b>

              </div>

              <div className="marker-actions">

                <button
                  className="save-button"
                  onClick={
                    saveMarker
                  }
                >
                  💾 저장
                </button>

                <button
                  className={
                    selectedMarker.discovered
                      ? "discovered-button active"
                      : "discovered-button"
                  }
                  onClick={
                    toggleDiscovered
                  }
                >
                  {selectedMarker.discovered
                    ? "✓ 발견함"
                    : "○ 발견함"}
                </button>

              </div>

              <button
                className="delete-button"
                onClick={
                  deleteMarker
                }
              >
                🗑️ 위치 삭제
              </button>

            </div>

          )}

          {largeImage && (
            <div
              className="image-modal"
              onClick={() =>
                setLargeImage(
                  null
                )
              }
            >

              <button
                className="image-modal-close"
                onClick={() =>
                  setLargeImage(
                    null
                  )
                }
              >
                ×
              </button>

              <img
                src={largeImage}
                alt="확대 사진"
                onClick={(
                  event
                ) =>
                  event.stopPropagation()
                }
              />

              <div className="image-modal-help">
                ESC 또는 바깥쪽 클릭으로 닫기
              </div>

            </div>
          )}

        </main>

      </div>

    </div>
  );
}

export default App;