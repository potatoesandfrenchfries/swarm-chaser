#include <vector>
#include <cstdio>

int main() {
    std::vector<int> v(4, 1);
    v[4] = 7; // BUG
    std::printf("%d\n", v[0]);
    return 0;
}
